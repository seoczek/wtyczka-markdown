import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

export const ENGINE_FILES = ["src/cleaner.js", "src/markdown.js", "src/extractor.js"];
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const sources = new Map(ENGINE_FILES.map((file) => [file, readFileSync(ROOT + file, "utf8")]));

export function createEngine({ body = "", url = "https://example.com/blog/post/index.html", title = "" } = {}) {
  const dom = new JSDOM(`<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`, {
    url,
    runScripts: "outside-only"
  });
  return injectEngine(dom.window);
}

export function injectEngine(win) {
  for (const source of sources.values()) win.eval(source);
  return win;
}

export function toMarkdown(html, options) {
  return createEngine(options).WMExt.markdown.htmlToMarkdown(html);
}

export function select(win, setup) {
  const range = win.document.createRange();
  setup(range, win.document);
  const selection = win.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  return range;
}

export function textIn(win, selector) {
  return win.document.querySelector(selector).firstChild;
}

export function extractAll(body, { mode = "smart", ...options } = {}) {
  const win = createEngine({ body, ...options });
  select(win, (range, doc) => range.selectNodeContents(doc.body));
  return win.WMExt.extractor.extract({ mode });
}

export function pipeline(body, options) {
  const result = extractAll(body, options);
  return result.ok ? result.markdown : `ERROR:${result.error}`;
}
