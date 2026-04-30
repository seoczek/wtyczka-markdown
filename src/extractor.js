(function (global) {
  const WMExt = (global.WMExt = global.WMExt || {});

  const CSS_MARKDOWN_LINE_PATTERN =
    /(@media|@supports|@container|:root\s*\{|--[a-z0-9_-]+\s*:|[.#]?[a-z0-9_-]+(?:\s+[a-z0-9_.#:-]+)*\s*\{)/i;

  function normalizeFallbackSnapshot(snapshot, win) {
    if (!snapshot || typeof snapshot !== "object") {
      return null;
    }

    const html = typeof snapshot.html === "string" ? snapshot.html : "";
    const text = typeof snapshot.text === "string" ? snapshot.text.replace(/\u00a0/g, " ").trim() : "";

    if (!html.trim() && !text) {
      return null;
    }

    return {
      range: null,
      html,
      text,
      title: typeof snapshot.title === "string" ? snapshot.title : win.document.title || "",
      url: typeof snapshot.url === "string" ? snapshot.url : win.location?.href || ""
    };
  }

  function getSelectionSnapshot(win, fallbackSnapshot) {
    const selection = win.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return normalizeFallbackSnapshot(fallbackSnapshot, win);
    }

    const range = selection.getRangeAt(0);
    const container = win.document.createElement("div");
    container.appendChild(range.cloneContents());

    return {
      range,
      html: container.innerHTML,
      text: selection.toString().replace(/\u00a0/g, " ").trim(),
      title: win.document.title || "",
      url: win.location?.href || ""
    };
  }

  function countWords(text) {
    const value = String(text || "").trim();
    return value ? value.split(/\s+/).length : 0;
  }

  function buildMarkdownFromSelection(options, win) {
    const runtime = win || global;
    const snapshot = getSelectionSnapshot(runtime, options?.selectionSnapshot);
    if (!snapshot) {
      return {
        ok: false,
        error: "Zaznacz tekst na stronie przed uruchomieniem konwersji."
      };
    }

    const doc = runtime.document;
    const container = doc.createElement("div");
    if (snapshot.range) {
      container.appendChild(snapshot.range.cloneContents());
    } else if (snapshot.html) {
      container.innerHTML = snapshot.html;
    } else {
      container.textContent = snapshot.text;
    }

    WMExt.cleaner.sanitizeSelectionContainer(container, options || {});

    let markdown = WMExt.markdown.htmlToMarkdown(container, options || {});
    markdown = stripCssNoise(markdown, options || {});
    if (!markdown && snapshot.text) {
      markdown = snapshot.text;
    }

    if (!markdown.trim()) {
      return {
        ok: false,
        error: "Nie udało się wygenerować Markdown z tego zaznaczenia."
      };
    }

    return {
      ok: true,
      html: container.innerHTML,
      markdown,
      text: snapshot.text,
      selectionText: snapshot.text,
      title: snapshot.title || doc.title || "",
      url: snapshot.url || runtime.location?.href || "",
      wordCount: countWords(markdown),
      warnings: []
    };
  }

  function stripCssNoise(markdown, options) {
    const mode = options?.mode === "strict" ? "strict" : "smart";
    if (!markdown || mode !== "smart") {
      return markdown;
    }

    const lines = String(markdown).split("\n");
    const cleaned = [];
    let inFence = false;
    let cssBuffer = [];

    function flushCssBuffer() {
      if (!cssBuffer.length) {
        return;
      }

      const block = cssBuffer.join(" ").replace(/\s+/g, " ").trim();
      if (!looksLikeCssNoise(block)) {
        cleaned.push(...cssBuffer);
      }
      cssBuffer = [];
    }

    lines.forEach((line) => {
      const trimmed = line.trim();

      if (trimmed.startsWith("```")) {
        flushCssBuffer();
        inFence = !inFence;
        cleaned.push(line);
        return;
      }

      if (inFence) {
        cleaned.push(line);
        return;
      }

      if (!trimmed) {
        flushCssBuffer();
        cleaned.push(line);
        return;
      }

      if (CSS_MARKDOWN_LINE_PATTERN.test(trimmed) || cssBuffer.length) {
        cssBuffer.push(line);
        const block = cssBuffer.join(" ");
        if (!/[{}]/.test(block) && cssBuffer.length < 4) {
          return;
        }

        if (looksLikeCssNoise(block)) {
          return;
        }

        flushCssBuffer();
        return;
      }

      cleaned.push(line);
    });

    flushCssBuffer();

    return cleaned
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function looksLikeCssNoise(text) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    if (value.length < 40) {
      return false;
    }

    const braces = (value.match(/[{}]/g) || []).length;
    const semicolons = (value.match(/;/g) || []).length;
    const cssDeclarations = (value.match(/:\s*[^:;{}]+;/g) || []).length;

    return CSS_MARKDOWN_LINE_PATTERN.test(value) && (braces >= 2 || semicolons >= 2 || cssDeclarations >= 2);
  }

  async function copyTextToClipboard(text, win) {
    const runtime = win || global;
    if (!text || !text.trim()) {
      return false;
    }

    try {
      if (runtime.navigator?.clipboard?.writeText) {
        await runtime.navigator.clipboard.writeText(text);
        return true;
      }
    } catch (error) {
      // Fallback below.
    }

    const textarea = runtime.document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "-9999px";
    textarea.style.width = "1px";
    textarea.style.height = "1px";
    textarea.style.opacity = "0";
    runtime.document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const copied = runtime.document.execCommand("copy");
    textarea.remove();
    return copied;
  }

  async function finalizeResult(result, options, win) {
    if (!result?.ok) {
      return result;
    }

    if (options?.collectMode && WMExt.session?.appendResult) {
      const sessionState = await WMExt.session.appendResult(result, options || {}, win || global);
      result.appendedToSession = true;
      result.sessionMarkdown = sessionState.markdown;
      result.sessionStats = sessionState.stats;
      result.sessionEntry = sessionState.entry;
    } else {
      result.appendedToSession = false;
    }

    if (options?.autoCopy) {
      const copied = await copyTextToClipboard(result.markdown, win || global);
      result.copied = copied;

      if (!copied) {
        result.warnings.push("Nie udało się automatycznie skopiować wyniku do schowka.");
      }
    } else {
      result.copied = false;
    }

    return result;
  }

  async function extractSelection(options, win) {
    const runtime = win || global;
    const result = buildMarkdownFromSelection(options, runtime);
    return finalizeResult(result, options, runtime);
  }

  async function quickConvert(options, win) {
    return extractSelection(options, win || global);
  }

  WMExt.extractor = {
    buildMarkdownFromSelection,
    copyTextToClipboard,
    extractSelection,
    finalizeResult,
    quickConvert
  };
})(window);
