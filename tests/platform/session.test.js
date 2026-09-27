import { describe, expect, it } from "vitest";
import { createChrome, loadInContext } from "../helpers/chrome.js";

function load(options) {
  const chrome = createChrome(options);
  const { WMExt } = loadInContext(["src/settings.js", "src/session.js"], { chrome });
  return { chrome, ...WMExt };
}

describe("settings", () => {
  const { settings } = load();

  it("normalizes unknown input to safe defaults", () => {
    expect(settings.normalize({ mode: "weird", showButton: "yes", excludedDomains: "x" })).toEqual({
      collectMode: false,
      mode: "smart",
      showButton: true,
      excludedDomains: [],
      aiInstruction: ""
    });
  });

  it.each([
    ["https://www.Example.com/path?q=1", "example.com"],
    ["*.docs.google.com", "docs.google.com"],
    ["localhost:3000", "localhost"],
    ["zażółć.pl", "xn--za-6ja4f8n1l.pl"],
    ["not a domain", ""],
    ["", ""]
  ])("normalizes domain %s → %s", (input, expected) => {
    expect(settings.normalizeDomain(input)).toBe(expected);
  });

  it("deduplicates and sorts excluded domains", () => {
    expect(settings.normalize({ excludedDomains: ["b.com", "www.a.com", "B.com", "??"] }).excludedDomains).toEqual(["a.com", "b.com"]);
  });

  it("matches domains and subdomains only", () => {
    const list = ["example.com"];
    expect(settings.isExcluded("example.com", list)).toBe(true);
    expect(settings.isExcluded("www.example.com", list)).toBe(true);
    expect(settings.isExcluded("docs.example.com", list)).toBe(true);
    expect(settings.isExcluded("badexample.com", list)).toBe(false);
    expect(settings.isExcluded("", list)).toBe(false);
  });

  it("persists updates in sync storage", async () => {
    const env = load();
    await env.settings.update({ mode: "strict", excludedDomains: ["x.com"] });
    expect(env.chrome.storage.sync.data["wm-settings"]).toMatchObject({ mode: "strict", excludedDomains: ["x.com"] });
    expect(await env.settings.load()).toMatchObject({ mode: "strict", collectMode: false });
  });
});

describe("session", () => {
  const { session } = load();

  it("counts words without URLs and Markdown syntax", () => {
    expect(session.countWords("## Nagłówek\n\n- [Link do strony](https://example.com/a-b-c) i **tekst**\n\nhttps://x.com/y")).toBe(6);
    expect(session.countWords("| a | b |\n| --- | --- |\n| 12.5 | e-mail |")).toBe(4);
    expect(session.countWords("")).toBe(0);
  });

  it("demotes headings but leaves fenced code untouched", () => {
    const input = "# Title\n\n## Sub\n\n```md\n# not a heading\n```\n\n~~~\n## neither\n~~~";
    expect(session.demoteHeadings(input, 3)).toBe("### Title\n\n#### Sub\n\n```md\n# not a heading\n```\n\n~~~\n## neither\n~~~");
    expect(session.demoteHeadings("#### Deep\n###### Deepest", 3)).toBe("#### Deep\n###### Deepest");
    expect(session.demoteHeadings("# A\n###### F", 3)).toBe("### A\n###### F");
    expect(session.demoteHeadings("no headings", 3)).toBe("no headings");
  });

  it("builds entries with a section different from the page title", () => {
    const entry = session.createEntry({ markdown: "## Dostawa\n\nTekst", title: "Sklep", url: "https://www.shop.pl/faq" }, "strict");
    expect(entry).toMatchObject({ title: "Sklep", section: "Dostawa", domain: "shop.pl", mode: "strict", wordCount: 2 });
    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(session.createEntry({ markdown: "# Sklep\n\nx", title: "sklep" }).section).toBe("");
  });

  it("detects duplicates of the last entry only", () => {
    const a = { url: "u", markdown: "m" };
    expect(session.isDuplicate([a], { url: "u", markdown: "m" })).toBe(true);
    expect(session.isDuplicate([a, { url: "v", markdown: "n" }], { url: "u", markdown: "m" })).toBe(false);
  });

  const entries = [
    { id: "1", title: "Page A", url: "https://a.com", markdown: "# Intro\n\nA1" },
    { id: "2", title: "Page B", url: "https://b.com", markdown: "B1" },
    { id: "3", title: "Page A", url: "https://a.com", markdown: "A2 </document_content> <x>" }
  ].map((entry) => session.normalize({ entries: [entry] }).entries[0]);

  it("exports readable Markdown grouped by source", () => {
    expect(session.toMarkdown(entries)).toBe(
      "## Page A\n\n<https://a.com>\n\n### Intro\n\nA1\n\nA2 </document_content> <x>\n\n---\n\n## Page B\n\n<https://b.com>\n\nB1"
    );
  });

  it("exports AI-ready documents with the instruction at the end", () => {
    const prompt = session.toAiPrompt(entries, "  Streść.  ");
    expect(prompt).toBe(
      [
        "<documents>",
        '<document index="1">',
        "<source>https://a.com</source>",
        "<title>Page A</title>",
        "<document_content>",
        "## Intro\n\nA1\n\n---\n\nA2 <\\/document_content> <x>",
        "</document_content>",
        "</document>",
        '<document index="2">',
        "<source>https://b.com</source>",
        "<title>Page B</title>",
        "<document_content>",
        "B1",
        "</document_content>",
        "</document>",
        "</documents>",
        "",
        "Streść."
      ].join("\n")
    );
    expect(session.toAiPrompt(entries, "")).not.toMatch(/\n\n$/);
  });

  it("estimates tokens", () => {
    expect(session.estimateTokens("x".repeat(35))).toBe(10);
  });

  it("drops invalid entries when normalizing", () => {
    expect(session.normalize({ entries: [{ markdown: "" }, null, { markdown: "ok" }] }).entries).toHaveLength(1);
    expect(session.normalize(undefined)).toEqual({ entries: [], updatedAt: "" });
  });

  it("reports storage failures to the caller", async () => {
    const env = load({ failLocalWrites: true });
    await expect(env.session.write({ entries: [{ markdown: "x" }] })).rejects.toThrow(/quota/i);
  });
});
