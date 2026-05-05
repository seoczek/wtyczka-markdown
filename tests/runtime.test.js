import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

function createRuntime(url = "https://example.com/article") {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url,
    runScripts: "outside-only"
  });

  return dom.window;
}

function loadRuntimeScript(win, file) {
  win.eval(readFileSync(file, "utf8"));
}

function loadMarkdownRuntime() {
  const win = createRuntime();
  loadRuntimeScript(win, "src/markdown.js");
  return win;
}

function loadCleanerAndMarkdownRuntime(url) {
  const win = createRuntime(url);
  loadRuntimeScript(win, "src/cleaner.js");
  loadRuntimeScript(win, "src/markdown.js");
  return win;
}

function loadFullExtractionRuntime(url) {
  const win = loadCleanerAndMarkdownRuntime(url);
  loadRuntimeScript(win, "src/session.js");
  loadRuntimeScript(win, "src/extractor.js");
  return win;
}

function loadContentScriptRuntime(url) {
  const win = loadFullExtractionRuntime(url);
  let messageListener = null;
  win.chrome = {
    runtime: {
      onMessage: {
        addListener(listener) {
          messageListener = listener;
        }
      }
    }
  };

  loadRuntimeScript(win, "src/content-script.js");

  return {
    win,
    sendMessage(message) {
      return new Promise((resolve) => {
        messageListener(message, {}, resolve);
      });
    }
  };
}

function createStorageMock(win, initial = {}, options = {}) {
  const data = { ...initial };
  return {
    data,
    get(key, callback) {
      callback({ [key]: data[key] });
    },
    set(payload, callback) {
      if (options.failSet) {
        win.chrome.runtime.lastError = { message: "Storage quota exceeded" };
      } else {
        Object.assign(data, payload);
        win.chrome.runtime.lastError = undefined;
      }
      callback();
    }
  };
}

describe("Markdown runtime security", () => {
  it("keeps only safe link protocols", () => {
    const win = loadMarkdownRuntime();
    const markdown = win.WMExt.markdown.htmlToMarkdown(`
      <p>
        <a href="https://safe.example/path(1)">safe</a>
        <a href="/relative">relative</a>
        <a href="mailto:test@example.com">mail</a>
        <a href="tel:+48123456789">phone</a>
        <a href="javascript:alert(1)">script</a>
        <a href="data:text/html,evil">data</a>
        <a href="file:///etc/passwd">file</a>
      </p>
    `);

    expect(markdown).toContain("[safe](https://safe.example/path%281%29)");
    expect(markdown).toContain("[relative](https://example.com/relative)");
    expect(markdown).toContain("[mail](mailto:test@example.com)");
    expect(markdown).toContain("[phone](tel:+48123456789)");
    expect(markdown).toContain("script");
    expect(markdown).toContain("data");
    expect(markdown).toContain("file");
    expect(markdown).not.toContain("javascript:");
    expect(markdown).not.toContain("data:text/html");
    expect(markdown).not.toContain("file://");
  });

  it("uses a longer code fence when code contains backticks", () => {
    const win = loadMarkdownRuntime();
    const markdown = win.WMExt.markdown.htmlToMarkdown(`
      <pre><code class="language-js">const sample = \`\`\`nested\`\`\`;</code></pre>
    `);

    expect(markdown).toContain("````js\n");
    expect(markdown).toContain("const sample = ```nested```;");
    expect(markdown).toContain("\n````");
  });

  it("preserves code block indentation", () => {
    const win = loadMarkdownRuntime();
    const markdown = win.WMExt.markdown.htmlToMarkdown(`
      <pre><code>function sample() {
  if (ready) {
    return 1;
  }
}</code></pre>
    `);

    expect(markdown).toContain("  if (ready) {");
    expect(markdown).toContain("    return 1;");
  });

  it("uses a valid inline code delimiter when code contains backticks", () => {
    const win = loadMarkdownRuntime();
    const markdown = win.WMExt.markdown.htmlToMarkdown("<p>Uzyj <code>npm `test`</code> teraz.</p>");

    expect(markdown).toBe("Uzyj `` npm `test` `` teraz.");
  });

  it("keeps nested lists nested without duplicating items", () => {
    const win = loadMarkdownRuntime();
    const markdown = win.WMExt.markdown.htmlToMarkdown(`
      <ul>
        <li>
          <div>Parent
            <ul>
              <li>Child</li>
            </ul>
          </div>
        </li>
      </ul>
    `);

    expect(markdown).toBe("- Parent\n  - Child");
    expect(markdown.match(/Child/g)).toHaveLength(1);
  });

  it("uses marker-aware indentation for nested ordered lists", () => {
    const win = loadMarkdownRuntime();
    const markdown = win.WMExt.markdown.htmlToMarkdown("<ol><li>Parent<ol><li>Child</li></ol></li></ol>");

    expect(markdown).toBe("1. Parent\n   1. Child");
  });
});

describe("Cleaner and image handling", () => {
  it("keeps image alt text without producing broken image markdown", () => {
    const win = loadCleanerAndMarkdownRuntime("https://example.com/article");
    const container = win.document.createElement("div");
    container.innerHTML = '<figure><img alt="Makieta produktu"><figcaption>Podpis</figcaption></figure>';

    win.WMExt.cleaner.sanitizeSelectionContainer(container, { mode: "smart" });
    const markdown = win.WMExt.markdown.htmlToMarkdown(container);

    expect(markdown).toContain("Obraz: Makieta produktu");
    expect(markdown).toContain("Podpis");
    expect(markdown).not.toContain("![](");
    expect(markdown).not.toContain("]()");
  });

  it("keeps image markdown only when the URL protocol is safe", () => {
    const win = loadCleanerAndMarkdownRuntime("https://example.com/article");
    const container = win.document.createElement("div");
    container.innerHTML = '<img src="/assets/product.png" alt="Produkt">';

    win.WMExt.cleaner.sanitizeSelectionContainer(container, { mode: "smart" });
    const markdown = win.WMExt.markdown.htmlToMarkdown(container);

    expect(markdown).toBe("![Produkt](https://example.com/assets/product.png)");
  });

  it("removes common junk while preserving code blocks", () => {
    const win = loadCleanerAndMarkdownRuntime();
    const container = win.document.createElement("div");
    container.innerHTML = `
      <article><p>Wazna tresc</p><pre><code>:root { color: red; }</code></pre></article>
      <aside class="newsletter"><p>Zapisz sie</p></aside>
      <p>.ad-banner { display: none; color: red; margin: 0; padding: 0; }</p>
    `;

    win.WMExt.cleaner.sanitizeSelectionContainer(container, { mode: "smart" });
    const markdown = win.WMExt.markdown.htmlToMarkdown(container);

    expect(markdown).toContain("Wazna tresc");
    expect(markdown).toContain(":root { color: red; }");
    expect(markdown).not.toContain("Zapisz sie");
    expect(markdown).not.toContain(".ad-banner");
  });

  it("keeps details summary text in smart mode", () => {
    const win = loadCleanerAndMarkdownRuntime("https://example.com/faq");
    const container = win.document.createElement("div");
    container.innerHTML = "<details><summary>Ile kosztuje dostawa?</summary><p>Dostawa kosztuje 15 zl.</p></details>";

    win.WMExt.cleaner.sanitizeSelectionContainer(container, { mode: "smart" });
    const markdown = win.WMExt.markdown.htmlToMarkdown(container);

    expect(markdown).toBe("**Ile kosztuje dostawa?**\n\nDostawa kosztuje 15 zl.");
  });
});

describe("Session and settings storage", () => {
  it("rejects when session storage write fails", async () => {
    const win = createRuntime();
    win.chrome = {
      runtime: {},
      storage: {
        local: createStorageMock(win, {}, { failSet: true })
      }
    };
    loadRuntimeScript(win, "src/session.js");

    await expect(
      win.WMExt.session.appendResult(
        { ok: true, markdown: "Tresc", title: "Tytul", url: "https://example.com" },
        { trigger: "test" },
        win
      )
    ).rejects.toThrow("Storage quota exceeded");
  });

  it("rejects when settings storage write fails", async () => {
    const win = createRuntime();
    win.chrome = {
      runtime: {},
      storage: {
        sync: createStorageMock(win, {}, { failSet: true })
      }
    };
    loadRuntimeScript(win, "src/settings.js");

    await expect(win.WMExt.settings.saveSettings({ collectMode: true })).rejects.toThrow("Storage quota exceeded");
  });
});

describe("Full selection extraction", () => {
  it("returns Markdown, not plain text, for a selected article fragment", async () => {
    const win = loadFullExtractionRuntime("https://example.com/article");
    win.document.body.innerHTML = `
      <article>
        <h2>Artykul</h2>
        <p>Tekst z <strong>pogrubieniem</strong> i <a href="/link">linkiem</a>.</p>
        <ul><li>Pierwszy punkt</li><li>Drugi punkt</li></ul>
        <blockquote><p>Cytat</p></blockquote>
      </article>
    `;

    const article = win.document.querySelector("article");
    const range = win.document.createRange();
    range.selectNodeContents(article);
    const selection = win.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    const result = await win.WMExt.extractor.extractSelection(
      { mode: "smart", autoCopy: false, collectMode: false },
      win
    );

    expect(result.ok).toBe(true);
    expect(result.markdown).toContain("## Artykul");
    expect(result.markdown).toContain("**pogrubieniem**");
    expect(result.markdown).toContain("[linkiem](https://example.com/link)");
    expect(result.markdown).toContain("- Pierwszy punkt");
    expect(result.markdown).toContain("> Cytat");
    expect(result.markdown).not.toBe(result.selectionText);
  });

  it("uses a saved selection snapshot when Chrome clears the live selection", async () => {
    const win = loadFullExtractionRuntime("https://example.com/article");

    const result = await win.WMExt.extractor.extractSelection(
      {
        mode: "smart",
        autoCopy: false,
        collectMode: false,
        selectionSnapshot: {
          html: '<article><h2>Tytul</h2><p>Tekst z <strong>formatowaniem</strong>.</p></article>',
          text: "Tytul Tekst z formatowaniem.",
          title: "Strona testowa",
          url: "https://example.com/article"
        }
      },
      win
    );

    expect(result.ok).toBe(true);
    expect(result.title).toBe("Strona testowa");
    expect(result.markdown).toContain("## Tytul");
    expect(result.markdown).toContain("**formatowaniem**");
  });

  it("keeps the last page selection available after popup focus clears it", async () => {
    const { win, sendMessage } = loadContentScriptRuntime("https://example.com/article");
    win.document.body.innerHTML = `
      <article>
        <h2>Naglowek</h2>
        <p>Tresc z <strong>formatem</strong>.</p>
      </article>
    `;

    const article = win.document.querySelector("article");
    const range = win.document.createRange();
    range.selectNodeContents(article);
    const selection = win.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    win.document.dispatchEvent(new win.Event("selectionchange"));
    selection.removeAllRanges();

    const result = await sendMessage({
      type: "WM_EXTRACT_SELECTION",
      options: {
        mode: "smart",
        autoCopy: false,
        collectMode: false
      }
    });

    expect(result.ok).toBe(true);
    expect(result.markdown).toContain("## Naglowek");
    expect(result.markdown).toContain("**formatem**");
  });
});
