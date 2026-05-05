(function (global) {
  const WMExt = (global.WMExt = global.WMExt || {});
  const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

  const BLOCK_TAGS = new Set([
    "article",
    "aside",
    "blockquote",
    "details",
    "div",
    "dl",
    "figure",
    "figcaption",
    "footer",
    "header",
    "main",
    "nav",
    "ol",
    "p",
    "pre",
    "section",
    "table",
    "ul"
  ]);

  function escapeMarkdownText(value) {
    return String(value)
      .replace(/\u00a0/g, " ")
      .replace(/\\/g, "\\\\")
      .replace(/([`*_{}\[\]])/g, "\\$1")
      .replace(/[ \t\r\n]+/g, " ");
  }

  function normalizeUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) {
      return "";
    }

    try {
      const value = new URL(raw, global.location.href);
      if (!ALLOWED_LINK_PROTOCOLS.has(value.protocol)) {
        return "";
      }
      return value.toString();
    } catch (error) {
      return "";
    }
  }

  function trimBlankLines(value) {
    return String(value || "")
      .replace(/^\n+/, "")
      .replace(/\n+$/, "");
  }

  function collapseInline(value) {
    return String(value || "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function getFenceMarker(line) {
    const match = String(line || "")
      .trim()
      .match(/^(`{3,}|~{3,})/);
    return match ? match[1] : "";
  }

  function isClosingFence(line, openingMarker) {
    const marker = getFenceMarker(line);
    return Boolean(marker && openingMarker && marker[0] === openingMarker[0] && marker.length >= openingMarker.length);
  }

  function collapseBlocks(value) {
    const lines = String(value || "")
      .replace(/\r\n?/g, "\n")
      .split("\n");
    const output = [];
    let fenceMarker = "";
    let blankLines = 0;

    lines.forEach((rawLine) => {
      if (fenceMarker) {
        output.push(rawLine);
        if (isClosingFence(rawLine, fenceMarker)) {
          fenceMarker = "";
          blankLines = 0;
        }
        return;
      }

      const line = rawLine.replace(/[ \t]+$/g, "");
      const openingMarker = getFenceMarker(line);
      if (openingMarker) {
        output.push(line);
        fenceMarker = openingMarker;
        blankLines = 0;
        return;
      }

      if (!line.trim()) {
        blankLines += 1;
        if (blankLines <= 2) {
          output.push("");
        }
        return;
      }

      blankLines = 0;
      output.push(line);
    });

    return trimBlankLines(output.join("\n"));
  }

  function prefixLines(value, prefix) {
    return trimBlankLines(value)
      .split("\n")
      .map((line) => (line ? `${prefix}${line}` : prefix.trimEnd()))
      .join("\n");
  }

  function indentBlock(value, indent) {
    return trimBlankLines(value)
      .split("\n")
      .map((line) => (line ? `${indent}${line}` : ""))
      .join("\n");
  }

  function blockify(value) {
    const normalized = collapseBlocks(value);
    return normalized ? `\n\n${normalized}\n\n` : "";
  }

  function escapeCode(value) {
    return String(value || "").replace(/\u00a0/g, " ");
  }

  function escapeMarkdownLinkText(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/([\[\]])/g, "\\$1");
  }

  function getLongestBacktickRun(content) {
    const matches = String(content || "").match(/`+/g) || [];
    return matches.reduce((max, value) => Math.max(max, value.length), 0);
  }

  function getFenceForCode(content) {
    return "`".repeat(Math.max(3, getLongestBacktickRun(content) + 1));
  }

  function serializeInlineCode(value) {
    const content = escapeCode(value).trim();
    if (!content) {
      return "``";
    }

    const delimiter = "`".repeat(Math.max(1, getLongestBacktickRun(content) + 1));
    const padding = delimiter.length > 1 ? " " : "";
    return `${delimiter}${padding}${content}${padding}${delimiter}`;
  }

  function serializeChildren(parent, ctx) {
    let output = "";
    parent.childNodes.forEach((child) => {
      output += serializeNode(child, ctx);
    });
    return output;
  }

  function serializeText(value) {
    const text = String(value || "").replace(/\u00a0/g, " ");
    if (!text.trim()) {
      return " ";
    }

    return escapeMarkdownText(text);
  }

  function serializeInline(node, ctx, options) {
    let output = "";
    node.childNodes.forEach((child) => {
      if (child.nodeType === global.Node.TEXT_NODE) {
        output += serializeText(child.nodeValue || "");
        return;
      }

      if (child.nodeType !== global.Node.ELEMENT_NODE) {
        return;
      }

      const tag = child.tagName.toLowerCase();
      if (options?.skipNestedLists && isNestedList(child)) {
        return;
      }

      if (tag === "br") {
        output += "  \n";
        return;
      }

      output += serializeNode(child, { ...ctx, inline: true });
    });

    return collapseInline(output);
  }

  function serializeLink(node, ctx) {
    const href = normalizeUrl(node.getAttribute("href") || "");
    const text = collapseInline(serializeInline(node, ctx)).trim();
    if (!href) {
      return text;
    }

    return `[${text || href}](${href.replace(/\(/g, "%28").replace(/\)/g, "%29")})`;
  }

  function getCodeLanguage(node) {
    const code = node.querySelector("code");
    const source = code || node;
    const className = source.className || "";
    const languageMatch =
      className.match(/language-([a-z0-9_-]+)/i) ||
      className.match(/lang(?:uage)?-([a-z0-9_-]+)/i) ||
      (source.getAttribute("data-language") || "").match(/^([a-z0-9_-]+)$/i) ||
      (source.getAttribute("data-lang") || "").match(/^([a-z0-9_-]+)$/i);

    return languageMatch ? languageMatch[1] : "";
  }

  function serializePre(node) {
    const code = node.querySelector("code");
    const language = getCodeLanguage(node);
    const content = ((code ? code.textContent : node.textContent) || "").replace(/\n+$/g, "");
    const fence = getFenceForCode(content);
    return `\n\n${fence}${language}\n${content}\n${fence}\n\n`;
  }

  function serializeDefinitionList(node, ctx) {
    const entries = [];
    let current = null;

    Array.from(node.children).forEach((child) => {
      const tag = child.tagName.toLowerCase();
      if (tag === "dt") {
        current = {
          term: collapseInline(serializeInline(child, ctx)).trim(),
          defs: []
        };
        entries.push(current);
        return;
      }

      if (tag === "dd") {
        if (!current) {
          current = { term: "", defs: [] };
          entries.push(current);
        }

        const definition = collapseBlocks(serializeChildren(child, ctx)).trim();
        if (definition) {
          current.defs.push(definition);
        }
      }
    });

    const blocks = entries
      .map((entry) => {
        const lines = [];
        if (entry.term) {
          lines.push(entry.term);
        }

        entry.defs.forEach((definition) => {
          lines.push(`: ${definition.replace(/\n/g, "\n  ")}`);
        });

        return lines.join("\n").trim();
      })
      .filter(Boolean);

    return blocks.length ? `\n\n${blocks.join("\n\n")}\n\n` : "";
  }

  function collectTableRows(table) {
    const rows = [];
    Array.from(table.children).forEach((child) => {
      const tag = child.tagName.toLowerCase();
      if (tag === "tr") {
        rows.push(child);
        return;
      }

      if (tag === "thead" || tag === "tbody" || tag === "tfoot") {
        Array.from(child.children).forEach((row) => {
          if (row.tagName && row.tagName.toLowerCase() === "tr") {
            rows.push(row);
          }
        });
      }
    });

    return rows;
  }

  function serializeTable(table, ctx) {
    const rows = collectTableRows(table);
    if (!rows.length) {
      return "";
    }

    const matrix = rows
      .map((row) =>
        Array.from(row.children)
          .filter((cell) => /^(td|th)$/i.test(cell.tagName))
          .map((cell) => collapseInline(serializeInline(cell, ctx)).trim().replace(/\|/g, "\\|"))
      )
      .filter((row) => row.length);

    if (!matrix.length) {
      return "";
    }

    const columns = Math.max(...matrix.map((row) => row.length));
    const normalized = matrix.map((row) => row.concat(Array(Math.max(columns - row.length, 0)).fill("")));
    const header = normalized[0];
    const body = normalized.slice(1);
    const headerLine = `| ${header.join(" | ")} |`;
    const divider = `| ${header.map(() => "---").join(" | ")} |`;
    const bodyLines = body.map((row) => `| ${row.join(" | ")} |`);

    return `\n\n${[headerLine, divider, ...bodyLines].join("\n")}\n\n`;
  }

  function isNestedList(node) {
    return node?.nodeType === global.Node.ELEMENT_NODE && /^(ul|ol)$/i.test(node.tagName);
  }

  function serializeListItem(item, ctx, ordered, index) {
    const indent = ctx.listIndent || "  ".repeat(ctx.listDepth || 0);
    const marker = ordered ? `${index + 1}. ` : "- ";
    const continuationIndent = `${indent}${" ".repeat(marker.length)}`;
    const nestedCtx = {
      ...ctx,
      listDepth: (ctx.listDepth || 0) + 1,
      listIndent: continuationIndent
    };
    let firstLineContent = "";
    const extraBlocks = [];

    item.childNodes.forEach((child) => {
      if (child.nodeType === global.Node.TEXT_NODE) {
        firstLineContent += serializeText(child.nodeValue || "");
        return;
      }

      if (child.nodeType !== global.Node.ELEMENT_NODE) {
        return;
      }

      const tag = child.tagName.toLowerCase();

      if (tag === "ul" || tag === "ol") {
        const nestedList = trimBlankLines(serializeList(child, nestedCtx, tag === "ol"));
        if (nestedList) {
          extraBlocks.push(nestedList);
        }
        return;
      }

      if (tag === "p" || tag === "div" || tag === "section" || tag === "article") {
        const paragraph = collapseInline(serializeInline(child, ctx, { skipNestedLists: true })).trim();
        if (!firstLineContent.trim()) {
          firstLineContent = paragraph;
        } else if (paragraph) {
          extraBlocks.push(indentBlock(paragraph, continuationIndent));
        }

        Array.from(child.children)
          .filter((node) => isNestedList(node))
          .forEach((nestedListNode) => {
            const nested = trimBlankLines(
              serializeList(nestedListNode, nestedCtx, nestedListNode.tagName.toLowerCase() === "ol")
            );
            if (nested) {
              extraBlocks.push(nested);
            }
          });

        return;
      }

      if (BLOCK_TAGS.has(tag)) {
        const block = trimBlankLines(serializeNode(child, nestedCtx));
        if (block) {
          extraBlocks.push(indentBlock(block, continuationIndent));
        }
        return;
      }

      firstLineContent += serializeNode(child, ctx);
    });

    const line = `${indent}${marker}${collapseInline(firstLineContent).trim()}`.trimEnd();
    const output = [line || `${indent}${marker}`.trimEnd(), ...extraBlocks.filter(Boolean)].join("\n");
    return output.trimEnd();
  }

  function serializeList(listNode, ctx, ordered) {
    const items = Array.from(listNode.children).filter((child) => child.tagName.toLowerCase() === "li");
    if (!items.length) {
      return "";
    }

    const lines = items.map((item, index) => serializeListItem(item, ctx, ordered, index));
    return `\n\n${lines.join("\n")}\n\n`;
  }

  function serializeDetails(node, ctx) {
    const summary = node.querySelector(":scope > summary");
    const summaryText = summary ? collapseInline(serializeInline(summary, ctx)).trim() : "";
    const body = Array.from(node.childNodes)
      .filter((child) => child !== summary)
      .map((child) => serializeNode(child, ctx))
      .join("");
    const parts = [];

    if (summaryText) {
      parts.push(`**${summaryText}**`);
    }

    const normalizedBody = collapseBlocks(body);
    if (normalizedBody) {
      parts.push(normalizedBody);
    }

    return parts.length ? `\n\n${parts.join("\n\n")}\n\n` : "";
  }

  function serializeNode(node, ctx) {
    if (node.nodeType === global.Node.TEXT_NODE) {
      return serializeText(node.nodeValue || "");
    }

    if (node.nodeType !== global.Node.ELEMENT_NODE) {
      return "";
    }

    if (node.hasAttribute("data-wm-image-alt")) {
      const alt = (node.getAttribute("data-wm-image-alt") || "").trim();
      const src = normalizeUrl(node.getAttribute("data-wm-image-src") || "");
      if (!alt) {
        return "";
      }

      if (src) {
        return `![${escapeMarkdownLinkText(alt)}](${src.replace(/\(/g, "%28").replace(/\)/g, "%29")})`;
      }

      return `Obraz: ${escapeMarkdownText(alt)}`;
    }

    if (node.hasAttribute("data-wm-checkbox")) {
      return node.getAttribute("data-wm-checkbox") === "checked" ? "[x] " : "[ ] ";
    }

    const tag = node.tagName.toLowerCase();

    switch (tag) {
      case "br":
        return "\n";
      case "hr":
        return "\n\n---\n\n";
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        const level = Number(tag.slice(1));
        return `\n\n${"#".repeat(level)} ${collapseInline(serializeInline(node, ctx)).trim()}\n\n`;
      }
      case "p":
      case "section":
      case "article":
      case "main":
      case "aside":
      case "header":
      case "footer":
      case "div":
      case "figure":
      case "figcaption":
        return blockify(serializeChildren(node, ctx));
      case "blockquote": {
        const body = collapseBlocks(serializeChildren(node, ctx));
        return body ? `\n\n${prefixLines(body, "> ")}\n\n` : "";
      }
      case "strong":
      case "b": {
        const value = collapseInline(serializeInline(node, ctx)).trim();
        return value ? `**${value}**` : "";
      }
      case "em":
      case "i": {
        const value = collapseInline(serializeInline(node, ctx)).trim();
        return value ? `*${value}*` : "";
      }
      case "del":
      case "s":
      case "strike": {
        const value = collapseInline(serializeInline(node, ctx)).trim();
        return value ? `~~${value}~~` : "";
      }
      case "mark": {
        const value = collapseInline(serializeInline(node, ctx)).trim();
        return value ? `==${value}==` : "";
      }
      case "kbd":
      case "samp":
        return serializeInlineCode(node.textContent || "");
      case "code":
        return node.parentElement && node.parentElement.tagName.toLowerCase() === "pre"
          ? escapeCode(node.textContent || "")
          : serializeInlineCode(node.textContent || "");
      case "pre":
        return serializePre(node);
      case "a":
        return serializeLink(node, ctx);
      case "ul":
        return serializeList(node, ctx, false);
      case "ol":
        return serializeList(node, ctx, true);
      case "table":
        return serializeTable(node, ctx);
      case "dl":
        return serializeDefinitionList(node, ctx);
      case "details":
        return serializeDetails(node, ctx);
      case "summary":
      case "thead":
      case "tbody":
      case "tfoot":
      case "tr":
      case "td":
      case "th":
      case "span":
      case "small":
      case "label":
      case "abbr":
      case "cite":
      case "time":
        return serializeChildren(node, ctx);
      case "img":
      case "picture":
      case "svg":
        return "";
      default:
        return serializeChildren(node, ctx);
    }
  }

  function normalizeInput(input) {
    if (input instanceof global.DocumentFragment) {
      const container = global.document.createElement("div");
      container.appendChild(input.cloneNode(true));
      return container;
    }

    if (input instanceof global.Element) {
      return input;
    }

    if (typeof input === "string") {
      const template = global.document.createElement("template");
      template.innerHTML = input;
      const container = global.document.createElement("div");
      container.appendChild(template.content.cloneNode(true));
      return container;
    }

    throw new TypeError("Unsupported input for HTML to Markdown conversion.");
  }

  function htmlToMarkdown(input) {
    const root = normalizeInput(input);
    return collapseBlocks(serializeChildren(root, { inline: false, listDepth: 0 }));
  }

  WMExt.markdown = {
    htmlToMarkdown,
    normalizeUrl
  };
})(window);
