import { describe, expect, it } from "vitest";
import { createEngine, extractAll, pipeline } from "../helpers/engine.js";

function sanitize(html, mode = "smart") {
  const win = createEngine();
  const root = win.WMExt.markdown.createContainer();
  root.innerHTML = html;
  const { warnings } = win.WMExt.cleaner.sanitize(root, { mode });
  return { markdown: win.WMExt.markdown.convert(root).markdown, warnings };
}

describe("ported: junk removal", () => {
  it("removes common junk while preserving code blocks", () => {
    const markdown = pipeline(`
      <article><p>Wazna tresc</p><pre><code>:root { color: red; }</code></pre></article>
      <aside class="newsletter"><p>Zapisz sie</p></aside>
      <p>.ad-banner { display: none; color: red; margin: 0; padding: 0; }</p>
    `);

    expect(markdown).toBe("Wazna tresc\n\n```\n:root { color: red; }\n```");
  });
});

describe("K3 junk detection", () => {
  it("K3 keeps page-builder and utility classes", () => {
    expect(
      pipeline(
        '<div class="elementor-widget elementor-widget-text-editor"><div class="elementor-widget-container"><p>Treść w Elementorze.</p></div></div>' +
          '<article class="post type-post sticky"><h2>Przypięty wpis</h2><p>Treść.</p></article>' +
          '<table class="table-fixed w-full"><thead class="sticky top-0"><tr><th>A</th></tr></thead><tr><td>1</td></tr></table>' +
          '<div class="hero-banner"><h1>Tytuł</h1><p>Lead</p></div>' +
          '<section class="menu"><h2>Menu</h2><ul><li>Pizza 30 zł</li></ul></section>'
      )
    ).toBe("Treść w Elementorze.\n\n## Przypięty wpis\n\nTreść.\n\n| A |\n| --- |\n| 1 |\n\n# Tytuł\n\nLead\n\n## Menu\n\n- Pizza 30 zł");
  });

  it("K3 matches only whole id and class tokens", () => {
    expect(
      pipeline(
        '<div class="shadow download address loaded header-menu"><p>ok</p></div><div class="post-breadcrumbs-wrap"><p>Tekst</p></div>' +
          '<div class="chat-gpt-guide"><p>ChatGPT</p></div><span class="tooltip">term</span>'
      )
    ).toBe("ok\n\nTekst\n\nChatGPT\n\nterm");
    expect(pipeline('<div class="ad-slot"><p>Reklama</p></div><div id="sidebar"><p>Boczne</p></div><p>Treść</p>')).toBe("Treść");
  });

  it("K3 ignores title, aria and name attributes", () => {
    expect(
      pipeline(
        '<p>Poradnik: <a href="/x" title="Advertising guide">kampanie</a> i <a href="/y" aria-describedby="tooltip-1">definicja</a>.</p>' +
          '<h2 title="Share this" aria-label="share">Nagłówek</h2>'
      )
    ).toBe('Poradnik: [kampanie](https://example.com/x "Advertising guide") i [definicja](https://example.com/y).\n\n## Nagłówek');
  });

  it("K3 keeps junk-named containers with substantial content", () => {
    const text = "Długi akapit z treścią artykułu. ".repeat(8);
    expect(pipeline(`<div class="promo"><h3>Oferta</h3><p>${text}</p></div>`)).toBe(`### Oferta\n\n${text.trim()}`);
    expect(pipeline('<div class="modal"><h2>Main</h2><p>Krótko</p></div>')).toBe("## Main\n\nKrótko");
  });

  it("K3 keeps the selection when the selection itself is inside a junk container", () => {
    const win = createEngine({ body: '<div class="sidebar"><p id="a">Wybrany tekst</p></div>' });
    const range = win.document.createRange();
    range.selectNodeContents(win.document.querySelector("#a"));
    win.getSelection().addRange(range);

    expect(win.WMExt.extractor.extract().markdown).toBe("Wybrany tekst");
  });
});

describe("W1 link lists", () => {
  const nav = '<ul class="links"><li><a href="/1">Home</a></li><li><a href="/2">Blog</a></li><li><a href="/3">Kontakt</a></li><li><a href="/4">O nas</a></li></ul>';

  it("W1 keeps link lists and prose with links in smart mode", () => {
    expect(pipeline(`<p>Treść artykułu.</p>${nav}`)).toContain("- [Home](https://example.com/1)");
  });

  it("W1 drops short link-only lists in strict mode", () => {
    expect(pipeline(`<p>Treść artykułu z dłuższym zdaniem.</p>${nav}`, { mode: "strict" })).toBe("Treść artykułu z dłuższym zdaniem.");
  });

  it("W1 keeps reference lists with long items and whole-selection lists in strict mode", () => {
    const references =
      '<ul><li><a href="/a">Google Search Central documentation</a></li><li><a href="/b">Schema.org product type docs</a></li>' +
      '<li><a href="/c">Web.dev performance guide for devs</a></li><li><a href="/d">MDN Web Docs reference pages</a></li></ul>';
    expect(pipeline(`<p>Źródła:</p>${references}`, { mode: "strict" })).toContain("- [MDN Web Docs reference pages]");
    expect(pipeline(nav, { mode: "strict" })).toContain("- [Kontakt](https://example.com/3)");
  });

  it("W1 keeps paragraphs with many inline links in strict mode", () => {
    const prose = '<div><a href="/a">Pierwszy</a>, <a href="/b">Drugi</a>, <a href="/c">Trzeci</a>, <a href="/d">Czwarty</a></div>';
    expect(pipeline(`<p>Wstęp artykułu.</p>${prose}`, { mode: "strict" })).toContain("[Czwarty](https://example.com/d)");
  });
});

describe("W8 static hidden detection", () => {
  it("W8 drops hidden attributes, inline styles and screen-reader text with a warning", () => {
    const result = extractAll(
      '<p>Czytaj więcej <span class="sr-only">o SEO</span></p><p hidden>H</p><p style="display: none !important">N</p>' +
        '<p><a href="/x">Link<span class="visually-hidden"> (nowe okno)</span></a></p>'
    );

    expect(result.markdown).toBe("Czytaj więcej\n\n[Link](https://example.com/x)");
    expect(result.warnings).toEqual(["hidden-content-skipped"]);
  });

  it("W8 drops cookie banners from known vendors", () => {
    const result = extractAll(
      '<div id="CybotCookiebotDialog"><p>Ta strona używa cookie.</p></div><div class="cc-window"><p>OK</p></div>' +
        '<div id="onetrust-banner-sdk"><p>OneTrust</p></div><div class="cookie-notice"><p>Zgoda</p></div><p>Tail</p>'
    );

    expect(result.markdown).toBe("Tail");
  });

  it("W8 drops aria-hidden decorations without a warning", () => {
    const result = extractAll('<h2><a class="header-anchor" href="#t" aria-hidden="true">¶</a> Title</h2>');

    expect(result.markdown).toBe("## Title");
    expect(result.warnings).toEqual([]);
  });
});

describe("Ś3 opacity detection", () => {
  it("Ś3 keeps semi-transparent text and drops fully transparent text", () => {
    const result = sanitize('<p style="opacity:0.9">Widoczny</p><p style="opacity: 0">A</p><p style="opacity:0.0">B</p><p style="opacity:0%">C</p><p style="opacity:0.05">D</p>');

    expect(result).toEqual({ markdown: "Widoczny\n\nD", warnings: ["hidden-content-skipped"] });
  });

  it("Ś3 keeps visibility-related declarations that do not hide", () => {
    expect(sanitize('<p style="display:none-ish; visibility: visible">V</p><p style="--display: none">W</p>').markdown).toBe("V\n\nW");
  });
});

describe("Ś12 quote attribution", () => {
  it("Ś12 keeps blockquote footer in smart and strict mode", () => {
    const html = "<blockquote><p>Cytat słynnej osoby.</p><footer>— <cite>Jan Kowalski</cite></footer></blockquote>";

    expect(pipeline(html)).toBe("> Cytat słynnej osoby.\n>\n> — Jan Kowalski");
    expect(pipeline(html, { mode: "strict" })).toBe("> Cytat słynnej osoby.\n>\n> — Jan Kowalski");
  });

  it("Ś12 keeps aside callouts in smart mode and drops them in strict mode", () => {
    const html = '<p>Wstęp.</p><aside class="note"><p><strong>Uwaga:</strong> notatka.</p></aside>';

    expect(pipeline(html)).toBe("Wstęp.\n\n**Uwaga:** notatka.");
    expect(pipeline(html, { mode: "strict" })).toBe("Wstęp.");
  });
});

describe("strict mode", () => {
  it("removes navigation, footers and strict-only tokens", () => {
    const html =
      '<nav><a href="/">Start</a></nav><div class="breadcrumbs"><a href="/">A</a> / B</div><h1>Tytuł</h1><p>Treść.</p>' +
      '<div class="related"><p>Podobne</p></div><footer><p>Stopka</p></footer><div role="navigation"><p>Menu</p></div>';

    expect(pipeline(html, { mode: "strict" })).toBe("# Tytuł\n\nTreść.");
    expect(pipeline(html)).toBe("[Start](https://example.com/)\n\n[A](https://example.com/) / B\n\n# Tytuł\n\nTreść.\n\nPodobne\n\nStopka\n\nMenu");
  });

  it("removes dialogs, scripts and embeds in both modes", () => {
    expect(pipeline('<p>a</p><div role="dialog"><p>d</p></div><script>x()</script><iframe src="/x"></iframe><svg><text>s</text></svg><p>b</p>')).toBe(
      "a\n\nb"
    );
  });
});
