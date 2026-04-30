(function (global) {
  const WMExt = (global.WMExt = global.WMExt || {});

  const SESSION_KEY = "wm-session";
  const DEFAULT_SESSION = {
    entries: [],
    updatedAt: ""
  };

  function getStorageArea(runtime) {
    return runtime?.chrome?.storage?.local || null;
  }

  function normalizeString(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function normalizeWordCount(value) {
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
  }

  function normalizeEntry(entry, index) {
    const value = entry && typeof entry === "object" ? entry : {};
    return {
      id: normalizeString(value.id) || `entry-${index + 1}`,
      title: normalizeString(value.title),
      section: normalizeString(value.section),
      url: normalizeString(value.url),
      domain: normalizeString(value.domain),
      mode: value.mode === "strict" ? "strict" : "smart",
      trigger: normalizeString(value.trigger),
      capturedAt: normalizeString(value.capturedAt),
      wordCount: normalizeWordCount(value.wordCount),
      markdown: normalizeString(value.markdown)
    };
  }

  function normalizeSession(session) {
    const value = session && typeof session === "object" ? session : {};
    return {
      entries: Array.isArray(value.entries)
        ? value.entries
            .map((entry, index) => normalizeEntry(entry, index))
            .filter((entry) => entry.markdown)
        : [],
      updatedAt: normalizeString(value.updatedAt)
    };
  }

  function readSession(runtime) {
    const storage = getStorageArea(runtime || global);
    if (!storage) {
      return Promise.resolve({ ...DEFAULT_SESSION });
    }

    return new Promise((resolve) => {
      storage.get(SESSION_KEY, (result) => {
        if (runtime?.chrome?.runtime?.lastError || global.chrome?.runtime?.lastError) {
          resolve({ ...DEFAULT_SESSION });
          return;
        }

        resolve(normalizeSession(result[SESSION_KEY]));
      });
    });
  }

  function writeSession(session, runtime) {
    const storage = getStorageArea(runtime || global);
    const normalized = normalizeSession(session);
    if (!storage) {
      return Promise.resolve(normalized);
    }

    return new Promise((resolve, reject) => {
      storage.set({ [SESSION_KEY]: normalized }, () => {
        const lastError = runtime?.chrome?.runtime?.lastError || global.chrome?.runtime?.lastError;
        if (lastError) {
          reject(new Error(lastError.message || "Nie udało się zapisać sesji."));
          return;
        }

        resolve(normalized);
      });
    });
  }

  function clearSession(runtime) {
    return writeSession({ ...DEFAULT_SESSION }, runtime || global);
  }

  function countWords(text) {
    const value = normalizeString(text);
    return value ? value.split(/\s+/).length : 0;
  }

  function getDomain(url) {
    if (!url) {
      return "";
    }

    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch (error) {
      return "";
    }
  }

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
  }

  function createEntryId(result) {
    const seed = slugify(result?.title || result?.section || result?.domain || "fragment") || "fragment";
    const stamp = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 7);
    return `${seed}-${stamp}-${rand}`;
  }

  function extractPrimaryHeading(markdown) {
    const match = String(markdown || "").match(/^#{1,6}\s+(.+)$/m);
    return match ? match[1].trim() : "";
  }

  function normalizeComparableText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function buildEntryFromResult(result, options) {
    const capturedAt = new Date().toISOString();
    const section = extractPrimaryHeading(result?.markdown);
    const title = normalizeString(result?.title) || normalizeString(result?.domain) || "Fragment";
    const normalizedTitle = normalizeComparableText(title);
    const normalizedSection = normalizeComparableText(section);

    return normalizeEntry(
      {
        id: createEntryId({ ...result, section }),
        title,
        section: normalizedSection && normalizedSection !== normalizedTitle ? section : "",
        url: normalizeString(result?.url),
        domain: getDomain(result?.url),
        mode: "smart",
        trigger: normalizeString(options?.trigger),
        capturedAt,
        wordCount: countWords(result?.markdown),
        markdown: normalizeString(result?.markdown)
      },
      0
    );
  }

  function getSessionStats(session) {
    const normalized = normalizeSession(session);
    const fragments = normalized.entries.length;
    const words = normalized.entries.reduce((sum, entry) => sum + entry.wordCount, 0);

    return {
      fragments,
      words,
      updatedAt: normalized.updatedAt
    };
  }

  function formatEntryMarkdown(entry) {
    const lines = [`## ${entry.title || "Fragment"}`];

    if (entry.section) {
      lines.push(`Section: ${entry.section}`);
    }

    if (entry.url) {
      lines.push(`Source: ${entry.url}`);
    }

    if (entry.domain) {
      lines.push(`Domain: ${entry.domain}`);
    }

    lines.push(`Captured: ${entry.capturedAt || new Date().toISOString()}`);
    lines.push(`Words: ${entry.wordCount}`);
    lines.push("");
    lines.push(entry.markdown.trim());

    return lines.join("\n").trim();
  }

  function exportSessionMarkdown(session) {
    const normalized = normalizeSession(session);
    if (!normalized.entries.length) {
      return "";
    }

    return normalized.entries.map(formatEntryMarkdown).join("\n\n---\n\n").trim();
  }

  async function appendResult(result, options, runtime) {
    const entry = buildEntryFromResult(result, options || {});
    const current = await readSession(runtime || global);
    const next = normalizeSession({
      entries: [...current.entries, entry],
      updatedAt: entry.capturedAt
    });

    const saved = await writeSession(next, runtime || global);
    return {
      entry,
      session: saved,
      markdown: exportSessionMarkdown(saved),
      stats: getSessionStats(saved)
    };
  }

  WMExt.session = {
    SESSION_KEY,
    DEFAULT_SESSION,
    appendResult,
    buildEntryFromResult,
    clearSession,
    exportSessionMarkdown,
    getSessionStats,
    normalizeSession,
    readSession,
    writeSession
  };
})(window);
