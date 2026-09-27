import { describe, expect, it } from "vitest";
import { createEngine, extractAll, injectEngine, select, textIn } from "../helpers/engine.js";

function extractRange(body, setup, options = {}) {
  const win = createEngine({ body });
  select(win, setup);
  return win.WMExt.extractor.extract(options);
}

function stubVisibility(win, isVisible) {
  win.Element.prototype.checkVisibility = function (options) {
    expect(options).toEqual({ visibilityProperty: true, opacityProperty: true });
    return isVisible(this);
  };
}

describe("ported: full selection extraction", () => {
  it("returns Markdown, not plain text, for a selected article fragment", () => {
    const win = createEngine({
      title: "Strona",
      body: `
        <article>
          <h2>Artykul</h2>
          <p>Tekst z <strong>pogrubieniem</strong> i <a href="/link">linkiem</a>.</p>
          <ul><li>Pierwszy punkt</li><li>Drugi punkt</li></ul>
          <blockquote><p>Cytat</p></blockquote>
        </article>`
    });
    select(win, (range, doc) => range.selectNodeContents(doc.querySelector("article")));

    const result = win.WMExt.extractor.extract({ mode: "smart" });

    expect(result).toEqual({
      ok: true,
      markdown:
        "## Artykul\n\nTekst z **pogrubieniem** i [linkiem](https://example.com/link).\n\n- Pierwszy punkt\n- Drugi punkt\n\n> Cytat",
      text: "Artykul\nTekst z pogrubieniem i linkiem.\nPierwszy punkt\nDrugi punkt\nCytat",
      title: "Strona",
      url: "https://example.com/blog/post/index.html",
      tables: [],
      warnings: []
    });
    expect(structuredClone(result)).toEqual(result);
  });

  it("uses the stub snapshot when the live selection is gone", () => {
    const win = createEngine({ body: "<article><h2>Tytul</h2><p>Tekst z <strong>formatowaniem</strong>.</p></article>" });
    const range = win.document.createRange();
    range.selectNodeContents(win.document.querySelector("article"));
    win.getSelection().removeAllRanges();
    win.WMExt.stub = { getSnapshot: () => ({ range, text: "Tytul Tekst z formatowaniem." }) };

    const result = win.WMExt.extractor.extract();

    expect(result.ok).toBe(true);
    expect(result.markdown).toBe("## Tytul\n\nTekst z **formatowaniem**.");
  });
});

describe("selection sources", () => {
  it("prefers the live selection over the snapshot", () => {
    const win = createEngine({ body: '<p id="live">Live</p><p id="old">Old</p>' });
    const old = win.document.createRange();
    old.selectNodeContents(win.document.querySelector("#old"));
    win.WMExt.stub = { getSnapshot: () => ({ range: old, text: "Old" }) };
    select(win, (range, doc) => range.selectNodeContents(doc.querySelector("#live")));

    expect(win.WMExt.extractor.extract().markdown).toBe("Live");
  });

  it("concatenates multiple ranges in document order", () => {
    const win = createEngine({ body: '<h2 id="a">First</h2><p>skip</p><table id="t"><tr><td id="c">x</td><td>y</td></tr></table>' });
    const first = win.document.createRange();
    first.selectNodeContents(win.document.querySelector("#a"));
    const second = win.document.createRange();
    second.setStart(textIn(win, "#c"), 0);
    second.setEnd(win.document.querySelector("#t tr"), 2);
    win.getSelection = () => ({ rangeCount: 2, getRangeAt: (index) => [second, first][index] });

    const result = win.WMExt.extractor.extract();

    expect(result.markdown).toBe("## First\n\n| x | y |\n| --- | --- |");
    expect(result.text).toBe("First\nx\ny");
    expect(result.tables).toEqual(["x\ty"]);
  });

  it("reads a selection inside a focused textarea as plain text", () => {
    const win = createEngine({ body: '<p>Strona</p><textarea id="f">Ala&nbsp;ma **kota**\nlinia</textarea>' });
    const field = win.document.querySelector("#f");
    field.focus();
    field.setSelectionRange(0, 21);

    expect(win.WMExt.extractor.extract()).toMatchObject({
      ok: true,
      markdown: "Ala ma **kota**\nlinia",
      text: "Ala ma **kota**\nlinia",
      tables: [],
      warnings: []
    });
  });

  it("reads a selection inside a focused text input", () => {
    const win = createEngine({ body: '<input id="f" type="search" value="szukana fraza">' });
    const field = win.document.querySelector("#f");
    field.focus();
    field.setSelectionRange(8, 13);

    expect(win.WMExt.extractor.extract().markdown).toBe("fraza");
  });

  it("returns no-selection without a selection, snapshot or field selection", () => {
    const win = createEngine({ body: '<p>Tekst</p><textarea id="f">abc</textarea>' });
    win.document.querySelector("#f").focus();

    expect(win.WMExt.extractor.extract()).toEqual({ ok: false, error: "no-selection" });
    win.WMExt.stub = { getSnapshot: () => null };
    expect(win.WMExt.extractor.extract()).toEqual({ ok: false, error: "no-selection" });
  });

  it("returns empty when nothing readable is selected", () => {
    expect(extractAll('<div> </div><img src="/p.gif" alt=""><script>x()</script>')).toEqual({ ok: false, error: "empty" });
  });

  it("falls back to plain text when conversion removes everything", () => {
    expect(extractAll('<div class="newsletter"><p>Zapisz się</p></div>')).toMatchObject({
      ok: true,
      markdown: "Zapisz się",
      text: "Zapisz się",
      warnings: ["plain-text-fallback"]
    });
  });
});

describe("K2 partial selections keep structure", () => {
  it("K2 keeps list items when the selection starts mid-item", () => {
    const result = extractRange('<ul><li id="a">Alpha one</li><li>Beta</li><li id="c">Gamma three</li></ul>', (range, doc) => {
      range.setStart(doc.querySelector("#a").firstChild, 3);
      range.setEnd(doc.querySelector("#c").firstChild, 5);
    });

    expect(result.markdown).toBe("- ha one\n- Beta\n- Gamma");
  });

  it("K2 continues ordered list numbering from the first selected item", () => {
    const body = '<ol start="2"><li>one</li><li>two</li><li id="a">three</li><li id="c">four</li></ol>';
    const result = extractRange(body, (range, doc) => {
      range.setStart(doc.querySelector("#a").firstChild, 0);
      range.setEnd(doc.querySelector("#c").firstChild, 4);
    });

    expect(result.markdown).toBe("4. three\n5. four");
  });

  it("K2 numbers an ol ancestor when the selection is inside one item", () => {
    const result = extractRange('<ol><li>a</li><li value="7">b</li><li><p id="a">wewnątrz</p></li></ol>', (range, doc) =>
      range.selectNodeContents(doc.querySelector("#a"))
    );

    expect(result.markdown).toBe("8. wewnątrz");
  });

  it("K2 keeps nested list items inside their list", () => {
    const result = extractRange('<ul><li>top<ul><li id="a">in1</li><li id="c">in2</li></ul></li></ul>', (range, doc) => {
      range.setStart(doc.querySelector("#a").firstChild, 0);
      range.setEnd(doc.querySelector("#c").firstChild, 3);
    });

    expect(result.markdown).toBe("- in1\n- in2");
  });

  it("K2 keeps table rows and cells", () => {
    const body =
      '<table><thead><tr><th>H1</th><th>H2</th></tr></thead><tbody><tr><td id="a">a1</td><td>a2</td></tr><tr><td>b1</td><td id="c">b2</td></tr></tbody></table>';
    const result = extractRange(body, (range, doc) => {
      range.setStart(doc.querySelector("#a").firstChild, 0);
      range.setEnd(doc.querySelector("#c").firstChild, 2);
    });

    expect(result.markdown).toBe("| a1 | a2 |\n| --- | --- |\n| b1 | b2 |");
    expect(result.tables).toEqual(["a1\ta2\nb1\tb2"]);
  });

  it("K2 keeps a table around text selected inside one cell", () => {
    const result = extractRange('<table><tr><td id="a">cell text</td></tr></table>', (range, doc) => {
      range.setStart(doc.querySelector("#a").firstChild, 0);
      range.setEnd(doc.querySelector("#a").firstChild, 4);
    });

    expect(result.markdown).toBe("cell");
  });

  it("K2 keeps headings, quotes and inline formatting", () => {
    const heading = extractRange('<h2 id="a">Heading text here</h2>', (range, doc) => {
      range.setStart(doc.querySelector("#a").firstChild, 0);
      range.setEnd(doc.querySelector("#a").firstChild, 12);
    });
    const quote = extractRange('<blockquote><p id="a">quoted words</p><p id="c">second</p></blockquote>', (range, doc) => {
      range.setStart(doc.querySelector("#a").firstChild, 0);
      range.setEnd(doc.querySelector("#c").firstChild, 6);
    });
    const strong = extractRange('<p>x <strong id="a">bold words</strong> y</p>', (range, doc) => {
      range.setStart(doc.querySelector("#a").firstChild, 0);
      range.setEnd(doc.querySelector("#a").firstChild, 4);
    });

    expect(heading.markdown).toBe("## Heading text");
    expect(quote.markdown).toBe("> quoted words\n>\n> second");
    expect(strong.markdown).toBe("**bold**");
  });

  it("K2 keeps code blocks and inline code", () => {
    const block = extractRange('<pre><code class="language-js" id="a">const a = 1;\nconst b = 2;</code></pre>', (range, doc) => {
      range.setStart(doc.querySelector("#a").firstChild, 0);
      range.setEnd(doc.querySelector("#a").firstChild, 20);
    });
    const inline = extractRange('<p>Run <code id="a">npm test now</code></p>', (range, doc) => {
      range.setStart(doc.querySelector("#a").firstChild, 0);
      range.setEnd(doc.querySelector("#a").firstChild, 8);
    });

    expect(block.markdown).toBe("```js\nconst a = 1;\nconst b\n```");
    expect(inline.markdown).toBe("`npm test`");
  });

  it("K2 keeps a partially selected heading and resolves links", () => {
    const result = extractRange('<article><h2 id="a">Heading text</h2><p id="c">Para <a href="../x">rel</a> text</p></article>', (range, doc) => {
      range.setStart(doc.querySelector("#a").firstChild, 3);
      range.setEnd(doc.querySelector("#c").lastChild, 3);
    });

    expect(result.markdown).toBe("## ding text\n\nPara [rel](https://example.com/blog/x) te");
  });

  it("K2 does not leak ancestor ids, styles or hidden state into the wrapper", () => {
    const result = extractRange('<ul id="nav" style="display:block" hidden><li id="a">item</li></ul>', (range, doc) =>
      range.selectNodeContents(doc.querySelector("#a"))
    );

    expect(result.markdown).toBe("- item");
  });
});

describe("W8 live hidden-element marking", () => {
  it("W8 drops elements hidden by stylesheets and cleans the live DOM", () => {
    const win = createEngine({
      body: '<div id="root"><p class="hid">Ukryte przez CSS</p><p>Widoczne <span class="hid">x</span></p><p class="hid"></p></div>'
    });
    stubVisibility(win, (element) => !element.classList.contains("hid"));
    select(win, (range, doc) => range.selectNodeContents(doc.querySelector("#root")));

    const result = win.WMExt.extractor.extract();

    expect(result.markdown).toBe("Widoczne");
    expect(result.text).toBe("Widoczne");
    expect(result.warnings).toEqual(["hidden-content-skipped"]);
    expect(win.document.querySelectorAll("[data-wm-hidden]")).toHaveLength(0);
  });

  it("W8 does not descend into hidden subtrees", () => {
    const win = createEngine({ body: '<div id="root"><section class="hid"><p>a</p><p>b</p></section><p>c</p></div>' });
    const checked = [];
    stubVisibility(win, (element) => {
      checked.push(element.localName);
      return !element.classList.contains("hid");
    });
    select(win, (range, doc) => range.selectNodeContents(doc.querySelector("#root")));

    expect(win.WMExt.extractor.extract().markdown).toBe("c");
    expect(checked).toEqual(["section", "p"]);
  });

  it("W8 keeps closed details content and display: contents wrappers", () => {
    const win = createEngine({
      body: '<div id="root"><details><summary>Q</summary><p class="hid">A</p></details><div class="hid" style="display: contents"><p>B</p></div></div>'
    });
    stubVisibility(win, (element) => !element.classList.contains("hid"));
    select(win, (range, doc) => range.selectNodeContents(doc.querySelector("#root")));

    const result = win.WMExt.extractor.extract();

    expect(result.markdown).toBe("**Q**\n\nA\n\nB");
    expect(result.warnings).toEqual([]);
  });

  it("W8 removes the temporary markers even when visibility checks throw", () => {
    const win = createEngine({ body: '<div id="root"><p class="hid">A</p><p class="boom">B</p></div>' });
    stubVisibility(win, (element) => {
      if (element.classList.contains("boom")) throw new Error("layout failed");
      return !element.classList.contains("hid");
    });
    select(win, (range, doc) => range.selectNodeContents(doc.querySelector("#root")));

    expect(() => win.WMExt.extractor.extract()).toThrow("layout failed");
    expect(win.document.querySelectorAll("[data-wm-hidden]")).toHaveLength(0);
  });

  it("W8 works without checkVisibility", () => {
    const win = createEngine({ body: '<p class="sr-only">SR</p><p>Tekst</p>' });
    expect(win.Element.prototype.checkVisibility).toBeUndefined();
    select(win, (range, doc) => range.selectNodeContents(doc.body));

    expect(win.WMExt.extractor.extract()).toMatchObject({ markdown: "Tekst", warnings: ["hidden-content-skipped"] });
  });

  it("W8 does not mutate the page when the selection is inside a text node", () => {
    const win = createEngine({ body: '<p id="a">Tylko tekst</p>' });
    stubVisibility(win, () => {
      throw new Error("should not be called");
    });
    select(win, (range, doc) => {
      range.setStart(doc.querySelector("#a").firstChild, 0);
      range.setEnd(doc.querySelector("#a").firstChild, 5);
    });

    expect(win.WMExt.extractor.extract().markdown).toBe("Tylko");
  });
});

describe("TSV export", () => {
  it("expands colspan and rowspan into empty grid positions", () => {
    const result = extractAll(
      '<table><tr><th colspan="2">AB</th><th>C</th></tr><tr><td rowspan="2">x</td><td>y</td><td>z</td></tr><tr><td>q</td><td>w</td></tr></table>'
    );

    expect(result.tables).toEqual(["AB\t\tC\nx\ty\tz\n\tq\tw"]);
  });

  it("collapses whitespace and guards formulas", () => {
    const result = extractAll(
      "<table><tr><td>  a \n\t b  </td><td>=SUM(A1:A2)</td><td>-5</td><td>+48 123</td><td>@x</td></tr><tr><td>l1<br>l2</td></tr></table>"
    );

    expect(result.tables).toEqual(["a b\t'=SUM(A1:A2)\t-5\t+48 123\t@x\nl1 l2\t\t\t\t"]);
  });

  it("exports each top-level table once and flattens nested tables", () => {
    const result = extractAll(
      "<table><tr><th>Outer</th></tr><tr><td><table><tr><td>in1</td><td>in2</td></tr></table></td></tr></table><p>x</p><table><tr><td>2</td><td>3</td></tr></table>"
    );

    expect(result.tables).toEqual(["Outer\nin1 in2", "2\t3"]);
  });

  it("skips layout and empty tables", () => {
    expect(extractAll('<table role="presentation"><tr><td>a</td><td>b</td></tr></table><table><tr><td>x</td></tr></table>').tables).toEqual([]);
  });

  it("exposes tableToTsv for live tables", () => {
    const win = createEngine({ body: "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>" });

    expect(win.WMExt.extractor.tableToTsv(win.document.querySelector("table"))).toBe("A\tB\n1\t");
  });
});

describe("engine packaging", () => {
  it("is idempotent when injected twice and keeps the stub namespace", () => {
    const win = createEngine({ body: "<p>Raz</p>" });
    const stub = { getSnapshot: () => null };
    win.WMExt.stub = stub;
    injectEngine(win);
    select(win, (range, doc) => range.selectNodeContents(doc.body));

    expect(win.WMExt.extractor.extract().markdown).toBe("Raz");
    expect(win.WMExt.stub).toBe(stub);
  });
});
