import { describe, expect, it } from "vitest";
import { createEngine, select } from "../helpers/engine.js";

const LARGE = 200_000;

function page(sections) {
  let html = '<header class="site-header"><nav><ul><li><a href="/">Start</a></li><li><a href="/blog">Blog</a></li></ul></nav></header><article>';
  for (let index = 0; index < sections; index += 1) {
    html +=
      `<section class="entry"><h2 id="s${index}">Sekcja ${index} <a class="anchor" href="#s${index}">#</a></h2>` +
      `<p>Akapit ${index} z <strong>pogrubieniem</strong>, <em>kursywą</em> i <a href="/link/${index}">linkiem</a>.</p>` +
      `<ul><li>Punkt <code>a_${index}</code></li><li>Drugi <span class="sr-only">ukryty</span></li></ul>` +
      `<table><tr><th>Nazwa</th><th>Cena</th></tr><tr><td>Produkt ${index}</td><td>${index} zł</td></tr></table>` +
      `<blockquote><p>Cytat ${index}</p></blockquote><pre><code class="language-js">const x = ${index};\nlog(x);</code></pre></section>`;
  }
  return `${html}</article><footer><p>Stopka</p></footer>`;
}

function fastest(run, repeat = 7) {
  let best = Infinity;
  for (let index = 0; index < repeat; index += 1) {
    const start = performance.now();
    run();
    best = Math.min(best, performance.now() - start);
  }
  return best;
}

function convertTime(win, html) {
  const root = win.WMExt.markdown.createContainer();
  root.innerHTML = html;
  const start = performance.now();
  win.WMExt.markdown.convert(root);
  return performance.now() - start;
}

describe("performance", () => {
  it("extracts a 3000-element selection in under 60 ms", () => {
    const win = createEngine({ body: page(125) });
    expect(win.document.body.querySelectorAll("*").length).toBeGreaterThanOrEqual(3000);
    select(win, (range, doc) => range.selectNodeContents(doc.body));
    const extract = () => win.WMExt.extractor.extract({ mode: "smart" });
    extract();

    expect(extract().markdown).toContain("## Sekcja 124");
    expect(fastest(extract)).toBeLessThan(60);
  });

  it.each([
    ["words", "lorem ".repeat(LARGE / 6)],
    ["spaced letters", "a ".repeat(LARGE / 2)],
    ["identifier", "a".repeat(LARGE)],
    ["unclosed brace", `${"lorem ".repeat(LARGE / 6)}{ x`],
    ["css rules", ".a { color: red; margin: 0; } ".repeat(LARGE / 30)],
    ["open braces", "a {".repeat(LARGE / 3)],
    ["declarations without braces", "color: red; ".repeat(LARGE / 12)],
    ["markdown punctuation", "*_[]`<a &amp;x; ~~ \\ # ".repeat(LARGE / 24)],
    ["hyphen rule", `${"- ".repeat(LARGE / 2)}x`],
    ["digits", `${"1".repeat(LARGE)}.`]
  ])("converts a 200 KB paragraph of %s in under 50 ms", (_, text) => {
    const win = createEngine();
    const html = `<p>${text.replace(/&(?!amp;)/g, "&amp;").replace(/</g, "&lt;")}</p>`;
    convertTime(win, "<p>warm-up</p>");

    expect(convertTime(win, html)).toBeLessThan(50);
  });

  it("parses a 200 KB srcset in under 50 ms", () => {
    const win = createEngine();
    const srcset = "/a.jpg 1w, ".repeat(LARGE / 11);

    expect(convertTime(win, `<img alt="x" srcset="${srcset}">`)).toBeLessThan(50);
  });

  it.each([
    ["spaces", ` ${" ".repeat(LARGE)}x`],
    ["semicolons", ";".repeat(LARGE)],
    ["declarations", "opacity: 0.5; ".repeat(LARGE / 14)],
    ["near misses", "display : non;".repeat(LARGE / 14)]
  ])("checks a 200 KB inline style of %s in under 50 ms", (_, style) => {
    const win = createEngine();
    const element = win.document.createElement("div");
    element.setAttribute("style", style);
    element.className = "a-b_c ".repeat(LARGE / 12);
    const start = performance.now();
    win.WMExt.cleaner.isStaticallyHidden(element);

    expect(performance.now() - start).toBeLessThan(50);
  });
});
