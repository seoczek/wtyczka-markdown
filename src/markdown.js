(() => {
  const WMExt = (globalThis.WMExt ??= {});

  const ELEMENT_NODE = 1;
  const TEXT_NODE = 3;
  const HARD_BREAK = "\uE000";
  const PARAGRAPH_BREAK = "\uE001";
  const CODE_SPACE = "\uE002";
  const BREAKS = /[\uE000\uE001]/g;
  const PRIVATE_MARKERS = /[\uE000-\uE002]/g;
  const MAX_DEPTH = 200;
  const MAX_DATA_URL_LENGTH = 1024;
  const MAX_SELECTOR_LENGTH = 200;
  const MAX_COLSPAN = 1000;

  const LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
  const IMAGE_PROTOCOLS = new Set(["http:", "https:", "data:"]);
  const LAZY_SOURCE_ATTRIBUTES = ["data-src", "data-lazy-src", "data-original"];
  const PERMALINK_TEXT = new Set(["#", "¶", "§", "🔗"]);
  const IGNORED_LANGUAGES = new Set(["none", "nohighlight"]);
  const GUTTER_CLASSES = new Set([
    "gutter",
    "linenos",
    "lineno",
    "line-number",
    "line-numbers-rows",
    "hljs-ln-numbers",
    "blob-num"
  ]);

  const SKIPPED_TAGS = new Set([
    "area", "audio", "base", "canvas", "datalist", "embed", "head", "iframe", "link", "map", "meta",
    "noscript", "object", "optgroup", "option", "param", "rp", "script", "source", "style", "svg",
    "template", "textarea", "title", "track", "video"
  ]);

  const BLOCK_TAGS = new Set([
    "address", "article", "aside", "blockquote", "caption", "center", "dd", "details", "dialog", "div",
    "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6",
    "header", "hgroup", "hr", "legend", "li", "main", "menu", "nav", "ol", "p", "pre", "search", "section",
    "summary", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul"
  ]);

  const INLINE_SPECIAL = /[\\`*_[\]<&~]/g;
  const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/;
  const WORD_CHARACTER = /[\p{L}\p{N}]/u;
  const ENTITY_REFERENCE = /#?[a-z\d]{1,32};/iy;
  const TAG_START = /[a-z/!?]/i;
  const BLOCK_MARKER = /^(?:#{1,6}|[+*-])(?:[ \t]|$)/;
  const SETEXT_OR_RULE = /^(?:=+|-+|-(?:[ \t]*-){2,})[ \t]*$/;
  const ORDERED_MARKER = /^(\d{1,9})[.)](?:[ \t]|$)/;
  const HTML_WHITESPACE = /[ \t\n\r\f\u00a0]+/g;
  const LANGUAGE_CLASS = /(?:^|\s)(?:lang(?:uage)?-|highlight-(?:source-)?)([\w+#.-]+)/i;
  const BRUSH_CLASS = /brush:\s*([\w+#.-]+)/i;
  const LANGUAGE_NAME = /^[\w+#.-]+$/;
  const CSS_START = /^(?:@[a-z-]+|:root\b|--[\w-]+\s*:|[.#*[:]|[a-z][\w-]*\s*[{,>+~.#:[])/i;
  const CSS_DECLARATION = /^\s*-{0,2}[a-z][\w-]*\s*:\s*\S/i;

  function createContainer() {
    const doc = globalThis.document.implementation.createHTMLDocument("");
    const base = doc.createElement("base");
    base.href = globalThis.document.baseURI;
    doc.head.append(base);
    return doc.body.appendChild(doc.createElement("div"));
  }

  function htmlToMarkdown(input) {
    const root = createContainer();
    if (typeof input === "string") {
      root.innerHTML = input;
    } else {
      root.append(root.ownerDocument.importNode(input, true));
    }
    return convert(root).markdown;
  }

  function convert(root) {
    const state = { warnings: new Set(), ...analyze(root) };
    const blocks = renderBlocks(root, { state, depth: 0 });
    return { markdown: joinBlocks(blocks).replaceAll(CODE_SPACE, " "), warnings: [...state.warnings] };
  }

  function analyze(root) {
    const blockHolders = new Set();
    const itemHolders = new Set();
    const stack = [[root, false]];
    while (stack.length) {
      const [element, done] = stack.pop();
      if (!done) {
        stack.push([element, true]);
        for (const child of elementsOf(element)) stack.push([child, false]);
        continue;
      }
      const parent = element.parentElement;
      if (!parent || element === root) continue;
      if (BLOCK_TAGS.has(element.localName) || blockHolders.has(element)) blockHolders.add(parent);
      if (element.localName === "li" || itemHolders.has(element)) itemHolders.add(parent);
    }
    return { blockHolders, itemHolders };
  }

  function joinBlocks(blocks) {
    return blocks.map((block) => block.text).join("\n\n");
  }

  function renderBlocks(parent, ctx, blocks = []) {
    return renderNodes(nodesOf(parent), ctx, blocks);
  }

  function renderNodes(nodes, ctx, blocks = []) {
    if (ctx.depth > MAX_DEPTH) {
      pushParagraphs(blocks, [...nodes].map((node) => renderText(textOf(node))).join(" "), ctx);
      return blocks;
    }

    const inner = { ...ctx, depth: ctx.depth + 1 };
    let pending = "";
    const flush = () => {
      pushParagraphs(blocks, pending, inner);
      pending = "";
    };
    const visit = (children) => {
      for (const node of children) {
        if (node.nodeType === TEXT_NODE) {
          pending += renderText(node.data);
        } else if (node.nodeType === ELEMENT_NODE && !SKIPPED_TAGS.has(node.localName)) {
          if (BLOCK_TAGS.has(node.localName)) {
            flush();
            renderBlock(node, inner, blocks);
          } else if (!inner.state.blockHolders.has(node)) {
            pending += renderInlineElement(node, inner);
          } else if (node.localName === "a") {
            flush();
            renderLinkedBlocks(node, inner, blocks);
          } else {
            visit(nodesOf(node));
          }
        }
      }
    };

    visit(nodes);
    flush();
    return blocks;
  }

  function renderBlock(element, ctx, blocks) {
    switch (element.localName) {
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
        return renderHeading(element, ctx, blocks);
      case "ul":
      case "ol":
      case "menu":
        return renderList(element, ctx, blocks);
      case "pre":
        return renderCode(element, ctx, blocks);
      case "blockquote":
        return renderQuote(element, ctx, blocks);
      case "table":
        return renderTable(element, ctx, blocks);
      case "dl":
        return renderDefinitionList(element, ctx, blocks);
      case "details":
        return renderDetails(element, ctx, blocks);
      case "hr":
        if (!ctx.inTable) blocks.push({ kind: "rule", text: "---" });
        return blocks;
      default:
        return renderBlocks(element, ctx, blocks);
    }
  }

  function pushParagraphs(blocks, raw, ctx) {
    if (!raw) return;
    for (const text of finishParagraphs(raw, ctx.inTable ? "<br>" : "\\\n", !ctx.inTable)) {
      if (!text.includes("`") && looksLikeCss(text.replace(/\\([\s\S])/g, "$1"))) {
        ctx.state.warnings.add("css-noise-removed");
      } else {
        blocks.push({ kind: "paragraph", text });
      }
    }
  }

  function finishParagraphs(raw, lineBreak, escapeStarts = true) {
    const paragraphs = [];
    const normalized = raw.replace(/ {2,}/g, " ").replace(/\uE000(?: ?\uE000)+/g, PARAGRAPH_BREAK);
    for (const part of normalized.split(PARAGRAPH_BREAK)) {
      const lines = part
        .split(HARD_BREAK)
        .map((line) => line.trim())
        .filter(Boolean);
      if (lines.length) paragraphs.push((escapeStarts ? lines.map(escapeLineStart) : lines).join(lineBreak));
    }
    return paragraphs;
  }

  function finishLine(raw) {
    return finishParagraphs(raw.replace(BREAKS, " "), " ", false)[0] ?? "";
  }

  function renderHeading(heading, ctx, blocks) {
    const text = finishLine(renderInline(heading, ctx.inTable ? { ...ctx, strong: true } : ctx));
    if (!text) return blocks;
    if (ctx.inTable) {
      blocks.push({ kind: "paragraph", text: `**${text}**` });
    } else {
      blocks.push({ kind: "heading", text: `${"#".repeat(Number(heading.localName[1]))} ${escapeClosingHashes(text)}` });
    }
    return blocks;
  }

  function escapeClosingHashes(text) {
    let start = text.length;
    while (start > 0 && text[start - 1] === "#") start -= 1;
    return start < text.length && text[start - 1] === " " ? `${text.slice(0, start)}\\${text.slice(start)}` : text;
  }

  function renderQuote(quote, ctx, blocks) {
    if (ctx.inTable) return renderBlocks(quote, ctx, blocks);
    const body = joinBlocks(renderBlocks(quote, ctx));
    if (body) {
      blocks.push({
        kind: "quote",
        text: body
          .split("\n")
          .map((line) => (line ? `> ${line}` : ">"))
          .join("\n")
      });
    }
    return blocks;
  }

  function renderCode(pre, ctx, blocks) {
    const code = trimTrailingNewlines(textOf(pre).replace(/\r\n?/g, "\n").replace(/\u00a0/g, " "));
    if (!code.trim()) return blocks;

    if (ctx.inTable) {
      const lines = code.split("\n").filter((line) => line.trim());
      blocks.push({ kind: "paragraph", text: lines.map(inlineCode).join("<br>") });
      return blocks;
    }

    const fence = "`".repeat(Math.max(3, longestRun(code, "`") + 1));
    blocks.push({ kind: "code", text: `${fence}${codeLanguage(pre)}\n${code}\n${fence}` });
    return blocks;
  }

  function trimTrailingNewlines(text) {
    let end = text.length;
    while (end > 0 && text[end - 1] === "\n") end -= 1;
    return text.slice(0, end);
  }

  function longestRun(text, char) {
    let longest = 0;
    let current = 0;
    for (const value of text) {
      current = value === char ? current + 1 : 0;
      longest = Math.max(longest, current);
    }
    return longest;
  }

  function codeLanguage(pre) {
    for (const node of [pre.querySelector("code"), pre, pre.parentElement]) {
      const language = node && languageOf(node);
      if (language && !IGNORED_LANGUAGES.has(language)) return language;
    }
    return "";
  }

  function languageOf(element) {
    const declared = element.getAttribute("data-lang") || element.getAttribute("data-language");
    if (declared && LANGUAGE_NAME.test(declared)) return declared.toLowerCase();
    const className = element.getAttribute("class") ?? "";
    const match = LANGUAGE_CLASS.exec(className) ?? BRUSH_CLASS.exec(className);
    return match ? match[1].toLowerCase() : "";
  }

  function renderList(list, ctx, blocks) {
    const items = listItems(list, ctx.state.itemHolders);
    if (!items.length) return blocks;

    const ordered = list.localName === "ol";
    const previous = blocks.at(-1);
    const follows = previous?.kind === "list" && previous.ordered === ordered;
    const numbers = ordered ? itemNumbers(list, items) : [];
    const delimiter = ordered ? (follows && previous.delimiter === "." ? ")" : ".") : follows && previous.delimiter === "-" ? "*" : "-";
    const rendered = items
      .map((item, index) => renderItem(item, ordered ? `${numbers[index]}${delimiter} ` : `${delimiter} `, ctx))
      .filter(Boolean);
    if (!rendered.length) return blocks;

    const loose = rendered.some((text) => text.includes("\n\n"));
    blocks.push({ kind: "list", ordered, delimiter, start: numbers[0], text: rendered.join(loose ? "\n\n" : "\n") });
    return blocks;
  }

  function listItems(list, itemHolders) {
    const items = [];
    const collect = (parent) => {
      for (const child of elementsOf(parent)) {
        const tag = child.localName;
        if (tag === "li") {
          items.push({ element: child, isItem: true, nested: [] });
        } else if ((tag === "ul" || tag === "ol") && items.length) {
          items.at(-1).nested.push(child);
        } else if (SKIPPED_TAGS.has(tag)) {
          continue;
        } else if (tag !== "ul" && tag !== "ol" && itemHolders.has(child)) {
          collect(child);
        } else {
          items.push({ element: child, isItem: false, nested: [] });
        }
      }
    };
    collect(list);
    return items;
  }

  function itemNumbers(list, items) {
    const reversed = list.hasAttribute("reversed");
    const start = Number.parseInt(list.getAttribute("start"), 10);
    let next = Number.isNaN(start) ? (reversed ? items.length : 1) : start;
    return items.map((item) => {
      const value = item.isItem ? Number.parseInt(item.element.getAttribute("value"), 10) : Number.NaN;
      if (!Number.isNaN(value)) next = value;
      const current = Math.max(0, next);
      next += reversed ? -1 : 1;
      return current;
    });
  }

  function renderItem(item, marker, ctx) {
    const blocks = item.isItem ? renderBlocks(item.element, ctx) : renderNodes([item.element], ctx);
    for (const nested of item.nested) renderList(nested, ctx, blocks);
    if (!blocks.length) return "";

    const indent = " ".repeat(marker.length);
    let text = marker + indentLines(blocks[0].text, indent, true);
    for (let index = 1; index < blocks.length; index += 1) {
      const tight = blocks[index - 1].kind === "paragraph" && interruptsParagraph(blocks[index]);
      text += (tight ? "\n" : "\n\n") + indentLines(blocks[index].text, indent);
    }
    return text;
  }

  function interruptsParagraph(block) {
    return (
      block.kind === "code" ||
      block.kind === "quote" ||
      block.kind === "heading" ||
      (block.kind === "list" && (!block.ordered || block.start === 1))
    );
  }

  function indentLines(text, indent, skipFirst = false) {
    return text
      .split("\n")
      .map((line, index) => (line && !(skipFirst && index === 0) ? indent + line : line))
      .join("\n");
  }

  function renderTable(table, ctx, blocks) {
    if (ctx.inTable) return flattenTable(table, blocks);

    const grid = tableGrid(table);
    const caption = elementsOf(table).find((child) => child.localName === "caption");
    const title = caption ? finishLine(renderInline(caption, grid ? { ...ctx, strong: true } : ctx)) : "";
    if (title) blocks.push({ kind: "paragraph", text: grid ? `**${title}**` : title });

    if (!grid) {
      for (const row of tableRows(table)) {
        for (const cell of tableCells(row)) renderBlocks(cell, ctx, blocks);
      }
      return blocks;
    }

    const cellCtx = { ...ctx, inTable: true };
    const rows = grid.map((row) => Array.from(row, (cell) => (cell ? renderCell(cell, cellCtx) : "")));
    const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
    const line = (cells) => `| ${Array.from({ length: width }, (_, index) => cells[index] ?? "").join(" | ")} |`;
    const lines = [line(rows[0]), line(Array(width).fill("---")), ...rows.slice(1).map(line)];
    blocks.push({ kind: "table", text: lines.join("\n") });
    return blocks;
  }

  function renderCell(cell, ctx) {
    return renderBlocks(cell, ctx)
      .map((block) => block.text.replaceAll("\n", "<br>"))
      .join("<br>")
      .replaceAll("|", "\\|");
  }

  function flattenTable(table, blocks) {
    for (const row of tableRows(table)) {
      const text = tableCells(row)
        .map((cell) => collapse(textOf(cell)))
        .filter(Boolean)
        .join(" ");
      if (text) blocks.push({ kind: "paragraph", text: escapeText(text) });
    }
    return blocks;
  }

  function tableGrid(table) {
    const role = table.getAttribute("role");
    if (role === "presentation" || role === "none") return null;

    const grid = [];
    let cellCount = 0;
    for (const section of tableSections(table)) {
      const carried = [];
      section.forEach((tr, rowIndex) => {
        const row = [];
        let column = 0;
        const skipCarried = () => {
          while (carried[column] > 0) {
            carried[column] -= 1;
            row[column] = null;
            column += 1;
          }
        };

        for (const cell of tableCells(tr)) {
          skipCarried();
          const colspan = clampSpan(cell.getAttribute("colspan"), MAX_COLSPAN);
          const rowsLeft = section.length - rowIndex;
          const rowspan = cell.getAttribute("rowspan") === "0" ? rowsLeft : clampSpan(cell.getAttribute("rowspan"), rowsLeft);
          for (let offset = 0; offset < colspan; offset += 1) {
            row[column + offset] = offset ? null : cell;
            if (rowspan > 1) carried[column + offset] = rowspan - 1;
          }
          column += colspan;
          cellCount += 1;
        }

        for (; column < carried.length; column += 1) {
          if (carried[column] > 0) {
            carried[column] -= 1;
            row[column] = null;
          }
        }
        if (row.length) grid.push(row);
      });
    }
    return cellCount > 1 ? grid : null;
  }

  function clampSpan(value, max) {
    const span = Number.parseInt(value, 10);
    return Number.isNaN(span) || span < 1 ? 1 : Math.min(span, max);
  }

  function tableSections(table) {
    const head = [];
    const body = [];
    const foot = [];
    let looseRows = null;
    for (const child of elementsOf(table)) {
      const tag = child.localName;
      if (tag === "tr") {
        if (!looseRows) body.push((looseRows = []));
        looseRows.push(child);
        continue;
      }
      looseRows = null;
      const rows = elementsOf(child).filter((row) => row.localName === "tr");
      if (tag === "thead") head.push(rows);
      else if (tag === "tbody") body.push(rows);
      else if (tag === "tfoot") foot.push(rows);
    }
    return [...head, ...body, ...foot];
  }

  function tableRows(table) {
    return tableSections(table).flat();
  }

  function tableCells(row) {
    return elementsOf(row).filter((cell) => cell.localName === "td" || cell.localName === "th");
  }

  function renderDefinitionList(list, ctx, blocks) {
    const entries = [];
    for (const item of definitionItems(list)) {
      if (item.localName === "dt") {
        const term = finishLine(renderInline(item, ctx));
        if (term) entries.push([term]);
        continue;
      }
      const definition = joinBlocks(renderBlocks(item, ctx));
      if (!definition) continue;
      if (!entries.length) entries.push([]);
      entries.at(-1).push(`: ${indentLines(definition, "  ", true)}`);
    }

    const text = entries.map((lines) => lines.join("\n")).join("\n\n");
    if (text) blocks.push({ kind: "dl", text });
    return blocks;
  }

  function definitionItems(list) {
    return elementsOf(list)
      .flatMap((child) => (child.localName === "div" ? elementsOf(child) : [child]))
      .filter((child) => child.localName === "dt" || child.localName === "dd");
  }

  function renderDetails(details, ctx, blocks) {
    const summary = elementsOf(details).find((child) => child.localName === "summary");
    const title = summary ? finishLine(renderInline(summary, { ...ctx, strong: true })) : "";
    if (title) blocks.push({ kind: "paragraph", text: `**${title}**` });
    return renderNodes(nodesOf(details).filter((node) => node !== summary), ctx, blocks);
  }

  function renderLinkedBlocks(link, ctx, blocks) {
    const start = blocks.length;
    renderBlocks(link, { ...ctx, link: true }, blocks);
    const href = ctx.link ? "" : resolveUrl(link.getAttribute("href"), link.baseURI, LINK_PROTOCOLS);
    if (!href || blocks.length === start) return blocks;

    const target = linkTarget(href, link.getAttribute("title"));
    const block = blocks.slice(start).find((candidate) => candidate.kind === "heading" || candidate.kind === "paragraph");
    if (!block) {
      blocks.push({ kind: "paragraph", text: `<${href}>` });
    } else if (block.kind === "heading") {
      const split = block.text.indexOf(" ") + 1;
      block.text = `${block.text.slice(0, split)}[${block.text.slice(split)}](${target})`;
    } else {
      block.text = `[${block.text}](${target})`;
    }
    return blocks;
  }

  function renderInline(parent, ctx) {
    if (ctx.depth > MAX_DEPTH) return renderText(textOf(parent));
    const inner = { ...ctx, depth: ctx.depth + 1 };
    let output = "";
    for (let child = parent.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === TEXT_NODE) output += renderText(child.data);
      else if (child.nodeType === ELEMENT_NODE) output += renderInlineElement(child, inner);
    }
    return output;
  }

  function renderInlineElement(element, ctx) {
    const tag = element.localName;
    if (SKIPPED_TAGS.has(tag)) return "";

    switch (tag) {
      case "br":
        return HARD_BREAK;
      case "wbr":
        return "";
      case "strong":
      case "b":
        return emphasize(element, ctx, "strong", "**");
      case "em":
      case "i":
      case "var":
      case "dfn":
        return emphasize(element, ctx, "em", "*");
      case "del":
      case "s":
      case "strike":
        return emphasize(element, ctx, "del", "~~");
      case "code":
      case "kbd":
      case "samp":
      case "tt":
        return inlineCode(textOf(element));
      case "a":
        return renderLink(element, ctx);
      case "img":
        return renderImage(element);
      case "input":
        return renderInput(element);
      case "select":
        return renderText(element.selectedOptions?.[0]?.textContent ?? "");
      case "button":
        return ` ${renderInline(element, ctx)} `;
      case "q":
        return `"${renderInline(element, ctx)}"`;
      case "rt":
        return `(${renderInline(element, ctx)})`;
      case "math":
        return renderMath(element);
      default:
        if (!BLOCK_TAGS.has(tag)) return renderInline(element, ctx);
        return (
          PARAGRAPH_BREAK +
          (tag === "pre" || tag === "table" ? renderText(textOf(element)) : renderInline(element, ctx)) +
          PARAGRAPH_BREAK
        );
    }
  }

  function emphasize(element, ctx, flag, marker) {
    if (ctx[flag]) return renderInline(element, ctx);
    return renderInline(element, { ...ctx, [flag]: true })
      .split(/([\uE000\uE001])/)
      .map((part, index) => (index % 2 ? part : withOuterSpace(part, (core) => `${marker}${core}${marker}`)))
      .join("");
  }

  function withOuterSpace(text, render) {
    const core = text.trim();
    if (!core) return text ? " " : "";
    const lead = text.length > text.trimStart().length ? " " : "";
    const trail = text.length > text.trimEnd().length ? " " : "";
    return `${lead}${render(core)}${trail}`;
  }

  function inlineCode(raw) {
    return withOuterSpace(raw.replace(/[\r\n\u00a0]/g, " "), (code) => {
      const fence = "`".repeat(longestRun(code, "`") + 1);
      const pad = code.startsWith("`") || code.endsWith("`") ? " " : "";
      return `${fence}${pad}${code.replaceAll(" ", CODE_SPACE)}${pad}${fence}`;
    });
  }

  function renderLink(link, ctx) {
    const content = renderInline(link, { ...ctx, link: true }).replace(BREAKS, " ");
    const text = content.trim();
    if (PERMALINK_TEXT.has(text)) return "";
    const href = ctx.link ? "" : resolveUrl(link.getAttribute("href"), link.baseURI, LINK_PROTOCOLS);
    if (!href) return content;
    if (!text) return link.querySelector("img") ? content : `${content}<${href}>`;
    const target = linkTarget(href, link.getAttribute("title"));
    return withOuterSpace(content, (label) => `[${label}](${target})`);
  }

  function linkTarget(href, title) {
    const cleanTitle = collapse(title ?? "");
    return cleanTitle ? `${formatUrl(href)} "${cleanTitle.replace(/["\\]/g, "\\$&")}"` : formatUrl(href);
  }

  function formatUrl(url) {
    return url.replaceAll("(", "%28").replaceAll(")", "%29");
  }

  function resolveUrl(raw, base, protocols) {
    const value = raw?.trim();
    if (!value) return "";
    try {
      const url = new URL(value, base);
      return protocols.has(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function renderImage(image) {
    if (isDecorativeImage(image)) return "";
    const alt = collapse(image.getAttribute("alt") ?? "");
    const src = imageSource(image);
    if (!src) return alt ? renderText(alt) : "";
    return `![${alt.replace(/[\\[\]]/g, "\\$&")}](${formatUrl(src)})`;
  }

  function isDecorativeImage(image) {
    const role = image.getAttribute("role");
    return (
      image.getAttribute("alt") === "" ||
      role === "presentation" ||
      role === "none" ||
      isTiny(image.getAttribute("width")) ||
      isTiny(image.getAttribute("height"))
    );
  }

  function isTiny(size) {
    return size !== null && Number.parseFloat(size) <= 2;
  }

  function imageSource(image) {
    const candidates = [
      image.getAttribute("src"),
      ...LAZY_SOURCE_ATTRIBUTES.map((name) => image.getAttribute(name)),
      largestSrcsetCandidate(image.getAttribute("srcset")),
      largestSrcsetCandidate(image.getAttribute("data-srcset"))
    ];
    let inlineData = "";
    for (const candidate of candidates) {
      const url = resolveUrl(candidate, image.baseURI, IMAGE_PROTOCOLS);
      if (!url) continue;
      if (!url.startsWith("data:")) return url;
      if (!inlineData && url.startsWith("data:image/") && url.length <= MAX_DATA_URL_LENGTH) inlineData = url;
    }
    return inlineData;
  }

  function largestSrcsetCandidate(srcset) {
    if (!srcset) return "";
    let best = "";
    let bestSize = -1;
    let index = 0;
    while (index < srcset.length) {
      while (index < srcset.length && (srcset[index] === "," || /\s/.test(srcset[index]))) index += 1;
      let end = index;
      while (end < srcset.length && !/\s/.test(srcset[end])) end += 1;
      let url = srcset.slice(index, end);
      let descriptor = "";
      if (url.endsWith(",")) {
        while (url.endsWith(",")) url = url.slice(0, -1);
        index = end;
      } else {
        const comma = srcset.indexOf(",", end);
        const stop = comma < 0 ? srcset.length : comma;
        descriptor = srcset.slice(end, stop).trim();
        index = stop + 1;
      }
      const size = Number.parseFloat(descriptor) || 1;
      if (url && size > bestSize) {
        best = url;
        bestSize = size;
      }
    }
    return best;
  }

  function renderInput(input) {
    const type = input.getAttribute("type")?.toLowerCase();
    if (type !== "checkbox" && type !== "radio") return "";
    return input.checked ? "[x] " : "[ ] ";
  }

  function renderMath(math) {
    const tex = math.querySelector('annotation[encoding="application/x-tex"]')?.textContent.trim();
    return tex ? `$${tex}$` : renderText(textOf(math));
  }

  function renderText(data) {
    return escapeText(data.replace(PRIVATE_MARKERS, "").replace(HTML_WHITESPACE, " "));
  }

  function escapeText(text) {
    return text.replace(INLINE_SPECIAL, (char, index, source) =>
      needsEscape(char, index, source) ? `\\${char}` : char
    );
  }

  function needsEscape(char, index, source) {
    const next = source[index + 1] ?? "";
    switch (char) {
      case "\\":
        return !next || ASCII_PUNCTUATION.test(next);
      case "_":
        return !(WORD_CHARACTER.test(source[index - 1] ?? "") && WORD_CHARACTER.test(next));
      case "<":
        return TAG_START.test(next);
      case "&":
        ENTITY_REFERENCE.lastIndex = index + 1;
        return ENTITY_REFERENCE.test(source);
      case "~":
        return source[index - 1] === "~" || next === "~";
      default:
        return true;
    }
  }

  function escapeLineStart(line) {
    if (line[0] === ">" || BLOCK_MARKER.test(line) || SETEXT_OR_RULE.test(line)) return `\\${line}`;
    const ordered = ORDERED_MARKER.exec(line);
    return ordered ? `${ordered[1]}\\${line.slice(ordered[1].length)}` : line;
  }

  function plainText(root) {
    return textOf(root, true)
      .replace(/\u00a0/g, " ")
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function textOf(node, collapseSpace = false) {
    const parts = [];
    let last = "\n";
    const push = (text) => {
      if (!text) return;
      parts.push(text);
      last = text[text.length - 1];
    };
    const endLine = () => {
      if (parts.length && last !== "\n") push("\n");
    };
    const walk = (parent, depth, preformatted) => {
      for (let child = parent.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === TEXT_NODE) {
          push(collapseSpace && !preformatted ? collapseText(child.data, last) : child.data);
          continue;
        }
        if (child.nodeType !== ELEMENT_NODE) continue;
        const tag = child.localName;
        if (tag === "br") {
          push("\n");
          continue;
        }
        if (depth > MAX_DEPTH || SKIPPED_TAGS.has(tag) || isGutter(child)) continue;
        const block = BLOCK_TAGS.has(tag);
        if (block) endLine();
        walk(child, depth + 1, preformatted || tag === "pre");
        if (block) endLine();
      }
    };
    walk(node, 0, false);
    return parts.join("").replace(PRIVATE_MARKERS, "");
  }

  function collapseText(data, last) {
    const text = data.replace(/\s+/g, " ");
    return last === "\n" || last === " " ? text.trimStart() : text;
  }

  function isGutter(element) {
    return classesOf(element).some((name) => GUTTER_CLASSES.has(name));
  }

  function classesOf(element) {
    const value = element.getAttribute("class");
    return value ? value.trim().split(/\s+/) : [];
  }

  function nodesOf(parent) {
    const nodes = [];
    for (let node = parent.firstChild; node; node = node.nextSibling) nodes.push(node);
    return nodes;
  }

  function elementsOf(parent) {
    const elements = [];
    for (let element = parent.firstElementChild; element; element = element.nextElementSibling) elements.push(element);
    return elements;
  }

  function collapse(text) {
    return text.replace(/\s+/g, " ").trim();
  }

  function looksLikeCss(text) {
    const source = text.trim();
    if (source.length < 20 || !CSS_START.test(source)) return false;

    let cursor = 0;
    let declarations = 0;
    while (cursor < source.length) {
      const open = source.indexOf("{", cursor);
      if (open < 0 || open - cursor > MAX_SELECTOR_LENGTH) break;
      const close = closingBrace(source, open);
      if (close < 0) return false;
      const found = source
        .slice(open + 1, close)
        .split(/[;{}]/)
        .filter((part) => CSS_DECLARATION.test(part)).length;
      if (!found) return false;
      declarations += found;
      cursor = close + 1;
      while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
    }
    return declarations >= 2 && cursor >= source.length * 0.9;
  }

  function closingBrace(text, open) {
    let depth = 0;
    for (let index = open; index < text.length; index += 1) {
      if (text[index] === "{") depth += 1;
      else if (text[index] === "}" && --depth === 0) return index;
    }
    return -1;
  }

  WMExt.markdown = {
    convert,
    classesOf,
    createContainer,
    elementsOf,
    htmlToMarkdown,
    plainText,
    tableGrid,
    textOf
  };
})();
