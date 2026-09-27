import { describe, expect, it } from "vitest";
import { createEngine, pipeline, toMarkdown } from "../helpers/engine.js";

describe("ported: links, code and lists", () => {
  it("keeps only safe link protocols", () => {
    const markdown = toMarkdown(`
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

    expect(markdown).toBe(
      "[safe](https://safe.example/path%281%29) [relative](https://example.com/relative) " +
        "[mail](mailto:test@example.com) [phone](tel:+48123456789) script data file"
    );
  });

  it("uses a longer code fence when code contains backticks", () => {
    const markdown = toMarkdown('<pre><code class="language-js">const sample = ```nested```;</code></pre>');

    expect(markdown).toBe("````js\nconst sample = ```nested```;\n````");
  });

  it("preserves code block indentation", () => {
    const markdown = toMarkdown("<pre><code>function sample() {\n  if (ready) {\n    return 1;\n  }\n}</code></pre>");

    expect(markdown).toBe("```\nfunction sample() {\n  if (ready) {\n    return 1;\n  }\n}\n```");
  });

  it("uses a valid inline code delimiter when code contains backticks", () => {
    expect(toMarkdown("<p>Uzyj <code>npm `test`</code> teraz.</p>")).toBe("Uzyj `` npm `test` `` teraz.");
  });

  it("keeps nested lists nested without duplicating items", () => {
    const markdown = toMarkdown("<ul><li><div>Parent<ul><li>Child</li></ul></div></li></ul>");

    expect(markdown).toBe("- Parent\n  - Child");
  });

  it("uses marker-aware indentation for nested ordered lists", () => {
    expect(toMarkdown("<ol><li>Parent<ol><li>Child</li></ol></li></ol>")).toBe("1. Parent\n   1. Child");
  });

  it("keeps details summary text", () => {
    const markdown = pipeline("<details><summary>Ile kosztuje dostawa?</summary><p>Dostawa kosztuje 15 zl.</p></details>");

    expect(markdown).toBe("**Ile kosztuje dostawa?**\n\nDostawa kosztuje 15 zl.");
  });
});

describe("ported: images", () => {
  it("keeps image alt text without producing broken image markdown", () => {
    const markdown = pipeline('<figure><img alt="Makieta produktu"><figcaption>Podpis</figcaption></figure>');

    expect(markdown).toBe("Makieta produktu\n\nPodpis");
  });

  it("keeps image markdown only when the URL protocol is safe", () => {
    expect(pipeline('<img src="/assets/product.png" alt="Produkt">')).toBe("![Produkt](https://example.com/assets/product.png)");
    expect(pipeline('<img src="javascript:alert(1)" alt="Zly">')).toBe("Zly");
  });
});

describe("K1 empty-noise removal", () => {
  it("K1 keeps <br>, <hr> and single-character content", () => {
    expect(pipeline("<p>Adres:<br>ul. Prosta 1<br>00-001 Warszawa</p><hr><p>Dalej</p>")).toBe(
      "Adres:\\\nul. Prosta 1\\\n00-001 Warszawa\n\n---\n\nDalej"
    );
  });

  it("K1 keeps single-character cells, strong, sup and em", () => {
    const markdown = pipeline(
      "<table><tr><th>Rozmiar</th><th>Dostępny</th></tr><tr><td><span>S</span></td><td><b>✓</b></td></tr></table>" +
        "<p>Ocena: <strong>5</strong>/5, wzór E=mc<sup>2</sup>, krok <em>a</em>, cena 9<span>€</span> <span>→</span></p>"
    );

    expect(markdown).toBe(
      "| Rozmiar | Dostępny |\n| --- | --- |\n| S | **✓** |\n\nOcena: **5**/5, wzór E=mc2, krok *a*, cena 9€ →"
    );
  });
});

describe("W2 block marker escaping", () => {
  it("W2 escapes block markers at line starts only", () => {
    const markdown = toMarkdown(
      "<p># not heading</p><p>1. not list</p><p>2) paren</p><p>- not bullet</p><p>+ plus</p><p>* star</p>" +
        "<p>&gt; not quote</p><p>===</p><p>---</p><p>___</p><p>```</p><p>~~~</p><p>&lt;div&gt; tag</p>"
    );

    expect(markdown.split("\n\n")).toEqual([
      "\\# not heading",
      "1\\. not list",
      "2\\) paren",
      "\\- not bullet",
      "\\+ plus",
      "\\* star",
      "\\> not quote",
      "\\===",
      "\\---",
      "\\_\\_\\_",
      "\\`\\`\\`",
      "\\~\\~\\~",
      "\\<div> tag"
    ]);
  });

  it("W2 keeps ordinary punctuation, URLs and numbers unescaped", () => {
    const markdown = toMarkdown(
      "<p>Cena: 5-10 zł (brutto) + VAT! https://example.com/a_b?x=1&amp;y=2 C# 2024 a#b snake_case_name 50% i &lt; 3</p>"
    );

    expect(markdown).toBe("Cena: 5-10 zł (brutto) + VAT! https://example.com/a_b?x=1&y=2 C# 2024 a#b snake_case_name 50% i < 3");
  });

  it("W2 escapes inline syntax that would otherwise change meaning", () => {
    expect(toMarkdown("<p>a [link](x) b &lt;tag&gt; c ~~d~~ 2*3*4 _lead a\\b `tick` &amp;amp;</p>")).toBe(
      "a \\[link\\](x) b \\<tag> c \\~\\~d\\~\\~ 2\\*3\\*4 \\_lead a\\b \\`tick\\` \\&amp;"
    );
  });

  it("W2 does not escape heading text that starts with a number", () => {
    expect(toMarkdown("<h2>1. Wprowadzenie</h2>")).toBe("## 1. Wprowadzenie");
  });

  it("W2 escapes ordered markers after hard breaks", () => {
    expect(toMarkdown("<p>Rok<br>2024. był dobry</p>")).toBe("Rok\\\n2024\\. był dobry");
  });
});

describe("W3 emphasis spacing", () => {
  it("W3 moves spaces outside the markers", () => {
    expect(toMarkdown("<p>word<strong> bold </strong>word<em> it </em>end <del> old </del>x</p>")).toBe(
      "word **bold** word *it* end ~~old~~ x"
    );
  });

  it("W3 drops empty emphasis", () => {
    expect(toMarkdown("<p>a<strong> </strong>b<em></em>c</p>")).toBe("a bc");
  });

  it("W3 splits emphasis around line breaks", () => {
    expect(toMarkdown("<p><strong>a<br>b</strong></p>")).toBe("**a**\\\n**b**");
  });

  it("W3 nests strong and emphasis", () => {
    expect(toMarkdown("<p><strong>bold <em>both</em></strong> and <em><strong>x</strong></em></p>")).toBe(
      "**bold *both*** and ***x***"
    );
  });

  it("W3 renders mark as highlight", () => {
    expect(toMarkdown("<p><mark>hi</mark></p>")).toBe("hi");
  });
});

describe("W4 code indentation", () => {
  it("W4 keeps pre indentation inside li > div > pre", () => {
    const markdown = toMarkdown(
      '<ol><li>Uruchom:<div class="highlight"><pre><code class="language-py">def f():\n    return 1</code></pre></div></li></ol>'
    );

    expect(markdown).toBe("1. Uruchom:\n   ```py\n   def f():\n       return 1\n   ```");
  });

  it("W4 keeps spaces inside inline code", () => {
    expect(toMarkdown("<p><code>a    b</code> and   text</p>")).toBe("`a    b` and text");
  });

  it("W4 keeps pre indentation inside a blockquote", () => {
    expect(toMarkdown("<blockquote><div><pre>  a\n    b</pre></div></blockquote>")).toBe("> ```\n>   a\n>     b\n> ```");
  });
});

describe("W5 list structure", () => {
  it("W5 handles div wrappers inside lists", () => {
    expect(toMarkdown("<ul><div><li>Parent<div><ul><li>Child</li></ul></div></li></div><li>Next</li></ul>")).toBe(
      "- Parent\n  - Child\n- Next"
    );
  });

  it("W5 renders deep nesting with marker-width indentation", () => {
    expect(toMarkdown("<ol><li>One<ul><li>A<ol><li>i</li><li>ii</li></ol></li><li>B</li></ul></li><li>Two</li></ol>")).toBe(
      "1. One\n   - A\n     1. i\n     2. ii\n   - B\n2. Two"
    );
  });

  it("W5 renders loose lists with paragraphs and blocks", () => {
    expect(toMarkdown("<ul><li><p>Para 1</p><p>Para 2</p></li><li><p>Item 2</p><pre><code>x=1</code></pre></li></ul>")).toBe(
      "- Para 1\n\n  Para 2\n\n- Item 2\n  ```\n  x=1\n  ```"
    );
  });

  it("W5 indents tables and quotes inside items", () => {
    expect(toMarkdown("<ol><li>Step<table><tr><th>a</th></tr><tr><td>b</td></tr></table></li></ol>")).toBe(
      "1. Step\n\n   | a |\n   | --- |\n   | b |"
    );
    expect(toMarkdown("<ol><li>Step<blockquote><p>note</p></blockquote></li></ol>")).toBe("1. Step\n   > note");
  });

  it("W5 aligns continuation lines after two-digit markers", () => {
    const items = Array.from({ length: 10 }, (_, index) => `<li>i${index}</li>`).join("");
    const markdown = toMarkdown(`<ol>${items}<li>last<ul><li>sub</li></ul></li></ol>`);

    expect(markdown.endsWith("10. i9\n11. last\n    - sub")).toBe(true);
  });

  it("W5 alternates markers between adjacent lists", () => {
    expect(toMarkdown("<ul><li>a</li></ul><ul><li>b</li></ul>")).toBe("- a\n\n* b");
  });

  it("W5 renders checkboxes as task items", () => {
    expect(toMarkdown('<ul><li><input type="checkbox" checked> done</li><li><input type="checkbox"> todo</li></ul>')).toBe(
      "- [x] done\n- [ ] todo"
    );
  });
});

describe("W6 tables", () => {
  it("W6 expands colspan and rowspan", () => {
    const markdown = toMarkdown(
      '<table><tr><th colspan="2">AB</th><th>C</th></tr><tr><td>1</td><td>2</td><td>3</td></tr>' +
        '<tr><td rowspan="2">x</td><td>y</td><td>z</td></tr><tr><td>q</td><td>w</td></tr></table>'
    );

    expect(markdown).toBe("| AB |  | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n| x | y | z |\n|  | q | w |");
  });

  it("W6 renders caption, escapes pipes and joins blocks with <br>", () => {
    const markdown = toMarkdown(
      "<table><caption>Cennik</caption><thead><tr><th>a|b</th><th></th></tr></thead>" +
        "<tbody><tr><td><ul><li>x</li><li>y</li></ul></td><td><p>p1</p><p>p2</p></td></tr></tbody></table>"
    );

    expect(markdown).toBe("**Cennik**\n\n| a\\|b |  |\n| --- | --- |\n| - x<br>- y | p1<br>p2 |");
  });

  it("W6 uses the first row as header, pads ragged rows and orders sections", () => {
    const markdown = toMarkdown(
      "<table><tfoot><tr><td>sum</td></tr></tfoot><tbody><tr><td>r1</td><td>r2</td></tr></tbody>" +
        "<thead><tr><th>H1</th><th>H2</th></tr></thead></table>"
    );

    expect(markdown).toBe("| H1 | H2 |\n| --- | --- |\n| r1 | r2 |\n| sum |  |");
  });

  it("W6 flattens nested tables and skips empty ones", () => {
    expect(toMarkdown("<table><tr><th>Outer</th></tr><tr><td><table><tr><td>in1</td><td>in2</td></tr></table></td></tr></table>")).toBe(
      "| Outer |\n| --- |\n| in1 in2 |"
    );
    expect(toMarkdown("<table></table><p>after</p>")).toBe("after");
  });

  it("W6 treats presentation tables as layout", () => {
    expect(pipeline('<table role="presentation"><tr><td><p>Treść</p></td><td><p>Obok</p></td></tr></table>')).toBe("Treść\n\nObok");
  });
});

describe("W7 form controls and wrappers", () => {
  it("W7 keeps button text and drops UI buttons", () => {
    expect(pipeline('<div class="faq"><h3><button aria-expanded="true">Jak długo trwa dostawa?</button></h3><p>2 dni.</p></div>')).toBe(
      "### Jak długo trwa dostawa?\n\n2 dni."
    );
    expect(pipeline('<p>Tekst <button class="share-btn">Udostępnij</button><button><svg></svg></button></p>')).toBe("Tekst");
  });

  it("W7 unwraps form, picture and label", () => {
    expect(pipeline('<form id="aspnetForm"><div><h2>Treść</h2><p><label>Imię</label> <input type="text" value="x"></p></div></form>')).toBe(
      "## Treść\n\nImię"
    );
    expect(pipeline('<picture><source srcset="/a.webp"><img src="/a.jpg" alt="Zdjęcie"></picture>')).toBe(
      "![Zdjęcie](https://example.com/a.jpg)"
    );
  });

  it("W7 renders the selected option of a select", () => {
    expect(toMarkdown("<p>Rozmiar: <select><option>S</option><option selected>M</option></select></p>")).toBe("Rozmiar: M");
  });
});

describe("Ś1 hard breaks", () => {
  it("Ś1 renders <br> as a backslash hard break in both modes", () => {
    expect(pipeline("<p>a<br>b</p>")).toBe("a\\\nb");
    expect(pipeline("<p>a<br>b</p>", { mode: "strict" })).toBe("a\\\nb");
  });

  it("Ś1 turns double <br> into a paragraph break and ignores trailing <br>", () => {
    expect(toMarkdown("<p>a<br><br>b<br></p>")).toBe("a\n\nb");
  });

  it("Ś1 renders <br> in headings as a space and in cells as <br>", () => {
    expect(toMarkdown("<h2>Line1<br>Line2</h2>")).toBe("## Line1 Line2");
    expect(toMarkdown("<table><tr><th>A</th></tr><tr><td>l1<br>l2</td></tr></table>")).toBe("| A |\n| --- |\n| l1<br>l2 |");
  });
});

describe("Ś2 CSS noise", () => {
  it("Ś2 drops CSS-looking paragraphs and reports it", () => {
    const win = createEngine();
    const root = win.WMExt.markdown.createContainer();
    root.innerHTML = "<p>Treść</p><p>.ad-banner { display: none; color: red; margin: 0; }</p>";

    expect(win.WMExt.markdown.convert(root)).toEqual({ markdown: "Treść", warnings: ["css-noise-removed"] });
  });

  it("Ś2 keeps prose that mentions CSS, braces or JSON", () => {
    for (const text of [
      "Reguła .btn { color: red; margin: 0; } ustawia kolor przycisku na czerwony.",
      "Zbiór A {1, 2}; zbiór B {3, 4}; wynik działania to suma obu zbiorów liczbowych.",
      'Odpowiedź API: data { "id": 1; "name": "x"; } koniec opisu odpowiedzi'
    ]) {
      expect(toMarkdown(`<p>${text}</p>`)).toBe(text);
    }
  });

  it("Ś2 never touches code", () => {
    expect(toMarkdown("<pre><code>.a { color: red; margin: 0; padding: 0; }</code></pre>")).toBe(
      "```\n.a { color: red; margin: 0; padding: 0; }\n```"
    );
    expect(toMarkdown("<p><code>.a { color: red; margin: 0; }</code></p>")).toBe("`.a { color: red; margin: 0; }`");
  });
});

describe("Ś4 images", () => {
  it("Ś4 uses lazy-load attributes and the largest srcset candidate", () => {
    expect(toMarkdown('<img src="data:image/gif;base64,R0lGOD" data-src="/real.jpg" alt="Lazy">')).toBe(
      "![Lazy](https://example.com/real.jpg)"
    );
    expect(toMarkdown('<img srcset="/s.jpg 480w, /l.jpg 1200w, /m.jpg 800w" alt="W">')).toBe("![W](https://example.com/l.jpg)");
    expect(toMarkdown('<img data-srcset="/s.jpg 1x, /l.jpg 2x" alt="X">')).toBe("![X](https://example.com/l.jpg)");
    expect(toMarkdown('<img data-lazy-src="/lazy.jpg" alt="L">')).toBe("![L](https://example.com/lazy.jpg)");
  });

  it("Ś4 keeps images without alt and drops decorative ones", () => {
    expect(toMarkdown('<p><img src="img/a.png"></p>')).toBe("![](https://example.com/blog/post/img/a.png)");
    expect(toMarkdown('<p>a<img src="/p.gif" width="1" height="1">b<img src="/d.png" alt="">c<img src="/r.png" role="presentation" alt="R"></p>')).toBe(
      "abc"
    );
  });

  it("Ś4 keeps small data URIs and drops large ones", () => {
    expect(toMarkdown('<img src="data:image/png;base64,AAA" alt="Inline">')).toBe("![Inline](data:image/png;base64,AAA)");
    expect(toMarkdown(`<img src="data:image/png;base64,${"A".repeat(2000)}" alt="Big">`)).toBe("Big");
  });

  it("Ś4 resolves relative URLs against the document base URI", () => {
    const win = createEngine({ body: '<p><a href="page">link</a> <img src="i.png" alt="I"></p>' });
    const base = win.document.createElement("base");
    base.href = "https://cdn.example.org/root/";
    win.document.head.append(base);

    expect(win.WMExt.markdown.htmlToMarkdown(win.document.body.firstChild)).toBe(
      "[link](https://cdn.example.org/root/page) ![I](https://cdn.example.org/root/i.png)"
    );
  });

  it("Ś4 links images inside links", () => {
    expect(toMarkdown('<a href="/p"><img src="/a.png" alt="Pic"></a>')).toBe("[![Pic](https://example.com/a.png)](https://example.com/p)");
  });
});

describe("Ś5 ordered lists", () => {
  it("Ś5 respects start, value and reversed", () => {
    expect(toMarkdown('<ol start="5"><li>five</li><li>six</li></ol>')).toBe("5. five\n6. six");
    expect(toMarkdown('<ol><li>a</li><li value="10">b</li><li>c</li></ol>')).toBe("1. a\n10. b\n11. c");
    expect(toMarkdown("<ol reversed><li>a</li><li>b</li><li>c</li></ol>")).toBe("3. a\n2. b\n1. c");
  });

  it("Ś5 separates paragraphs inside list items", () => {
    expect(toMarkdown("<ol><li><p>A</p><p>B</p></li><li><p>C</p></li></ol>")).toBe("1. A\n\n   B\n\n2. C");
  });
});

describe("Ś6 code blocks", () => {
  it("Ś6 reads the language from code, pre, parent and data attributes", () => {
    expect(toMarkdown('<pre class="language-js"><code>let x;</code></pre>')).toBe("```js\nlet x;\n```");
    expect(toMarkdown('<div class="highlight highlight-source-python"><pre>print(1)</pre></div>')).toBe("```python\nprint(1)\n```");
    expect(toMarkdown('<pre class="brush: php"><code>echo 1;</code></pre>')).toBe("```php\necho 1;\n```");
    expect(toMarkdown('<pre data-lang="rust"><code>fn a() {}</code></pre>')).toBe("```rust\nfn a() {}\n```");
    expect(toMarkdown('<pre><code class="hljs language-ts">let a = 1;</code></pre>')).toBe("```ts\nlet a = 1;\n```");
  });

  it("Ś6 turns <br> in pre into newlines and strips line-number gutters", () => {
    expect(toMarkdown("<pre><code>a<br>b<br>c</code></pre>")).toBe("```\na\nb\nc\n```");
    expect(toMarkdown('<pre><span class="line-numbers-rows"><span></span></span><code>x = 1</code></pre>')).toBe("```\nx = 1\n```");
  });

  it("Ś6 keeps tilde fences literal inside code", () => {
    expect(toMarkdown("<pre><code>~~~\nx\n~~~</code></pre>")).toBe("```\n~~~\nx\n~~~\n```");
  });
});

describe("Ś7 links", () => {
  it("Ś7 applies block-wrapping links to the heading", () => {
    expect(toMarkdown('<a href="https://x.com/p"><h3>Card title</h3><p>desc</p></a>')).toBe("### [Card title](https://x.com/p)\n\ndesc");
  });

  it("Ś7 applies block-wrapping links to the first paragraph when there is no heading", () => {
    expect(toMarkdown('<a href="/p"><div><p>Opis</p><p>Więcej</p></div></a>')).toBe("[Opis](https://example.com/p)\n\nWięcej");
  });

  it("Ś7 keeps link titles and falls back to the URL for empty links", () => {
    expect(toMarkdown('<p><a href="https://x.com" title="Tytuł">t</a></p>')).toBe('[t](https://x.com/ "Tytuł")');
    expect(toMarkdown('<p><a href="/x"></a>text</p>')).toBe("<https://example.com/x>text");
  });

  it("Ś7 drops permalink anchors in headings", () => {
    expect(toMarkdown('<h2 id="x"><a href="#x" class="anchor">#</a>Title <a href="/p">link</a></h2>')).toBe(
      "## Title [link](https://example.com/p)"
    );
  });

  it("Ś7 escapes brackets inside link text", () => {
    expect(toMarkdown('<p><a href="https://x.com">a [b] *c*</a></p>')).toBe("[a \\[b\\] \\*c\\*](https://x.com/)");
  });
});

describe("misc inline and block elements", () => {
  it("renders sup, sub and abbr as text and kbd as code", () => {
    expect(toMarkdown('<p>x<sup>2</sup> H<sub>2</sub>O <abbr title="HyperText">HTML</abbr> <kbd>Ctrl</kbd>+<kbd>C</kbd></p>')).toBe(
      "x2 H2O HTML `Ctrl`+`C`"
    );
  });

  it("renders q with quotes, ruby with readings and math as text", () => {
    expect(toMarkdown("<p><q>cytat</q></p>")).toBe('"cytat"');
    expect(toMarkdown("<p><ruby>漢<rp>(</rp><rt>kan</rt><rp>)</rp></ruby></p>")).toBe("漢(kan)");
    expect(toMarkdown("<p><math><mi>x</mi><mo>+</mo><mn>1</mn></math></p>")).toBe("x+1");
  });

  it("renders definition lists", () => {
    expect(toMarkdown("<dl><dt>Term</dt><dd>Def 1</dd><dd>Def 2</dd></dl>")).toBe("Term\n: Def 1\n: Def 2");
  });

  it("renders details with the summary in bold", () => {
    expect(toMarkdown("<details><summary>Q?</summary><p>A.</p></details>")).toBe("**Q?**\n\nA.");
  });

  it("renders nested blockquotes", () => {
    expect(toMarkdown("<blockquote><p>outer</p><blockquote><p>inner</p></blockquote><ul><li>li</li></ul></blockquote>")).toBe(
      "> outer\n>\n> > inner\n>\n> - li"
    );
  });

  it("keeps at most one blank line and no outer whitespace", () => {
    expect(toMarkdown("\n\n<p>  a  </p><div></div><p></p><br><br><br><p>b</p>\n\n")).toBe("a\n\nb");
  });

  it("decodes entities and collapses whitespace", () => {
    expect(toMarkdown("<p>A&nbsp;B &amp; C &lt; D &copy; &#8212; E\n   F</p>")).toBe("A B & C < D © — E F");
  });

  it("keeps spacing between inline elements", () => {
    expect(toMarkdown("<p><span>Hello</span><span>World</span></p><p><span>a</span> <span>b</span></p>")).toBe("HelloWorld\n\na b");
  });
});

describe("plain text helpers", () => {
  it("plainText keeps block boundaries and line breaks", () => {
    const win = createEngine();
    const root = win.WMExt.markdown.createContainer();
    root.innerHTML = "<h2>T</h2><p>a<br>b&nbsp;c</p><ul><li>x</li><li>y</li></ul><pre>  k\n  l</pre><script>no</script>";

    expect(win.WMExt.markdown.plainText(root)).toBe("T\na\nb c\nx\ny\n  k\n  l");
  });
});
