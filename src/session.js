(() => {
  const WMExt = (globalThis.WMExt ??= {});
  const SESSION_KEY = "wm-session";
  const QUOTA_WARNING_BYTES = 8 * 1024 * 1024;
  const CHARS_PER_TOKEN = 3.5;
  const FENCE = /^ {0,3}(`{3,}|~{3,})/;
  const HEADING = /^ {0,3}(#{1,6})(?=[ \t]|$)/;

  const text = (value) => (typeof value === "string" ? value.trim() : "");

  function normalizeEntry(entry) {
    const value = entry && typeof entry === "object" ? entry : {};
    const markdown = text(value.markdown);
    return {
      id: text(value.id) || crypto.randomUUID(),
      title: text(value.title),
      section: text(value.section),
      url: text(value.url),
      domain: text(value.domain) || getDomain(value.url),
      mode: value.mode === "strict" ? "strict" : "smart",
      capturedAt: text(value.capturedAt),
      wordCount: Number.isInteger(value.wordCount) && value.wordCount >= 0 ? value.wordCount : countWords(markdown),
      markdown
    };
  }

  function normalize(session) {
    const entries = Array.isArray(session?.entries) ? session.entries.map(normalizeEntry).filter((entry) => entry.markdown) : [];
    return { entries, updatedAt: text(session?.updatedAt) };
  }

  function countWords(markdown) {
    const plain = String(markdown ?? "")
      .replace(/\]\([^)\s]*(?:\s+"[^"]*")?\)/g, "]")
      .replace(/\b(?:https?|mailto|tel):\S+/g, "");
    return plain.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  }

  function getDomain(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  function scanLines(markdown, visit) {
    let fence = null;
    return String(markdown ?? "")
      .split("\n")
      .map((line) => {
        const marker = line.match(FENCE)?.[1];
        if (fence) {
          if (marker && marker[0] === fence[0] && marker.length >= fence.length && !line.trim().slice(marker.length).trim()) fence = null;
          return line;
        }
        if (marker) {
          fence = marker;
          return line;
        }
        return visit(line);
      });
  }

  function primaryHeading(markdown) {
    let heading = "";
    scanLines(markdown, (line) => {
      if (!heading && HEADING.test(line)) heading = line.replace(HEADING, "").replace(/[ \t]#+[ \t]*$/, "").trim();
      return line;
    });
    return heading;
  }

  function demoteHeadings(markdown, topLevel) {
    let minLevel = 7;
    scanLines(markdown, (line) => {
      const level = line.match(HEADING)?.[1].length;
      if (level) minLevel = Math.min(minLevel, level);
      return line;
    });
    const shift = Math.max(0, topLevel - minLevel);
    if (!shift || minLevel === 7) return markdown;
    return scanLines(markdown, (line) => line.replace(HEADING, (_, hashes) => "#".repeat(Math.min(6, hashes.length + shift)))).join("\n");
  }

  function createEntry(result, mode) {
    const markdown = text(result?.markdown);
    const title = text(result?.title);
    const section = primaryHeading(markdown);
    return normalizeEntry({
      title,
      section: section.toLowerCase() === title.toLowerCase() ? "" : section,
      url: result?.url,
      mode,
      capturedAt: new Date().toISOString(),
      wordCount: countWords(markdown),
      markdown
    });
  }

  function isDuplicate(entries, entry) {
    const last = entries.at(-1);
    return Boolean(last) && last.url === entry.url && last.markdown === entry.markdown;
  }

  function groupBySource(entries) {
    const groups = new Map();
    for (const entry of entries) {
      const key = entry.url || entry.title || entry.id;
      if (!groups.has(key)) groups.set(key, { url: entry.url, title: entry.title || entry.domain || entry.url, fragments: [] });
      groups.get(key).fragments.push(entry.markdown);
    }
    return [...groups.values()];
  }

  function toMarkdown(entries) {
    return groupBySource(entries)
      .map(({ url, title, fragments }) => {
        const header = [`## ${title || url}`, url && `<${url}>`].filter(Boolean).join("\n\n");
        return [header, ...fragments.map((fragment) => demoteHeadings(fragment, 3))].join("\n\n");
      })
      .join("\n\n---\n\n");
  }

  const escapeTag = (value) => String(value ?? "").replace(/</g, "&lt;");

  function toAiPrompt(entries, instruction) {
    const documents = groupBySource(entries).map(({ url, title, fragments }, index) =>
      [
        `<document index="${index + 1}">`,
        url && `<source>${escapeTag(url)}</source>`,
        title && `<title>${escapeTag(title)}</title>`,
        "<document_content>",
        fragments.map((fragment) => demoteHeadings(fragment, 2)).join("\n\n---\n\n").replace(/<\/document_content>/gi, "<\\/document_content>"),
        "</document_content>",
        "</document>"
      ]
        .filter(Boolean)
        .join("\n")
    );
    return [["<documents>", ...documents, "</documents>"].join("\n"), text(instruction)].filter(Boolean).join("\n\n");
  }

  const estimateTokens = (value) => Math.ceil(String(value ?? "").length / CHARS_PER_TOKEN);

  async function read() {
    try {
      const stored = await chrome.storage.local.get(SESSION_KEY);
      return normalize(stored[SESSION_KEY]);
    } catch {
      return normalize();
    }
  }

  async function write(session) {
    const next = normalize({ ...session, updatedAt: new Date().toISOString() });
    await chrome.storage.local.set({ [SESSION_KEY]: next });
    return next;
  }

  async function isNearQuota() {
    const bytes = await chrome.storage.local.getBytesInUse?.(SESSION_KEY).catch(() => 0);
    return (bytes ?? 0) >= QUOTA_WARNING_BYTES;
  }

  WMExt.session = {
    SESSION_KEY,
    normalize,
    countWords,
    getDomain,
    primaryHeading,
    demoteHeadings,
    createEntry,
    isDuplicate,
    toMarkdown,
    toAiPrompt,
    estimateTokens,
    read,
    write,
    isNearQuota
  };
})();
