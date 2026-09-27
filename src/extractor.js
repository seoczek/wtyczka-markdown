(() => {
  const WMExt = (globalThis.WMExt ??= {});

  const HIDDEN_ATTRIBUTE = "data-wm-hidden";
  const WRAPPER_TAGS = new Set([
    "a", "b", "blockquote", "code", "dd", "del", "dl", "dt", "em", "h1", "h2", "h3", "h4", "h5", "h6", "i",
    "kbd", "li", "mark", "ol", "pre", "q", "s", "strong", "sub", "sup", "table", "tbody", "td", "tfoot", "th",
    "thead", "tr", "ul"
  ]);
  const LIST_TAGS = new Set(["li", "ol", "ul"]);
  const TABLE_TAGS = new Set(["table", "tbody", "td", "tfoot", "th", "thead", "tr"]);
  const WRAPPER_DROPPED_ATTRIBUTES = ["aria-hidden", "hidden", "id", "style"];
  const TEXT_CONTROL_TYPES = new Set(["", "search", "tel", "text", "url"]);

  function extract({ mode = "smart" } = {}) {
    const fieldText = readTextControl();
    if (fieldText) return success(fieldText, fieldText, [], []);

    const ranges = readRanges();
    if (!ranges.length) return { ok: false, error: "no-selection" };

    const root = WMExt.markdown.createContainer();
    const warnings = new Set();
    for (const range of ranges) {
      if (cloneRange(range, root)) warnings.add("hidden-content-skipped");
    }
    const text = WMExt.markdown.plainText(root);

    for (const warning of WMExt.cleaner.sanitize(root, { mode }).warnings) warnings.add(warning);
    const tables = topLevelTables(root).map(tableToTsv).filter(Boolean);
    const converted = WMExt.markdown.convert(root);
    for (const warning of converted.warnings) warnings.add(warning);

    if (converted.markdown) return success(converted.markdown, text, tables, [...warnings]);
    if (!text) return { ok: false, error: "empty" };
    warnings.add("plain-text-fallback");
    return success(text, text, tables, [...warnings]);
  }

  function success(markdown, text, tables, warnings) {
    return { ok: true, markdown, text, title: document.title, url: location.href, tables, warnings };
  }

  function readTextControl() {
    const field = document.activeElement;
    const type = field?.getAttribute("type")?.toLowerCase() ?? "";
    if (field?.localName !== "textarea" && !(field?.localName === "input" && TEXT_CONTROL_TYPES.has(type))) return "";
    const { selectionStart: start, selectionEnd: end } = field;
    return typeof start === "number" && end > start ? field.value.slice(start, end).replace(/\u00a0/g, " ").trim() : "";
  }

  function readRanges() {
    const selection = globalThis.getSelection?.();
    const ranges = [];
    for (let index = 0; index < (selection?.rangeCount ?? 0); index += 1) {
      const range = selection.getRangeAt(index);
      if (!range.collapsed) ranges.push(range);
    }
    if (ranges.length) return ranges.sort((a, b) => a.compareBoundaryPoints(Range.START_TO_START, b));

    const range = WMExt.stub?.getSnapshot?.()?.range;
    return range && !range.collapsed ? [range] : [];
  }

  function cloneRange(range, root) {
    const target = root.ownerDocument;
    const marked = [];
    let fragment;
    try {
      markHidden(range, marked);
      fragment = cloneSpan(range.startContainer, range.startOffset, range.endContainer, range.endOffset, target);
    } finally {
      for (const element of marked) element.removeAttribute(HIDDEN_ATTRIBUTE);
    }

    let skippedHidden = false;
    for (const element of fragment.querySelectorAll(`[${HIDDEN_ATTRIBUTE}]`)) {
      skippedHidden ||= element.textContent.trim() !== "";
      element.remove();
    }
    numberStartLists(range, fragment);

    const wrapper = target.createElement("div");
    root.append(wrapper);
    ancestorShells(range, wrapper).append(fragment);
    return skippedHidden;
  }

  function cloneSpan(startContainer, startOffset, endContainer, endOffset, target) {
    const fragment = target.createDocumentFragment();
    if (startContainer === endContainer && isCharacterData(startContainer)) {
      fragment.append(sliceData(startContainer, startOffset, endOffset, target));
      return fragment;
    }

    const common = commonAncestor(startContainer, endContainer);
    const startChild = startContainer === common ? null : childToward(common, startContainer);
    const endChild = endContainer === common ? null : childToward(common, endContainer);

    if (startChild) {
      fragment.append(
        isCharacterData(startChild)
          ? sliceData(startChild, startOffset, startChild.length, target)
          : partialClone(startChild, [startContainer, startOffset, startChild, startChild.childNodes.length], target)
      );
    }
    const stop = endChild ?? common.childNodes[endOffset] ?? null;
    let node = startChild ? startChild.nextSibling : common.childNodes[startOffset];
    for (; node && node !== stop; node = node.nextSibling) fragment.append(target.importNode(node, true));
    if (endChild) {
      fragment.append(
        isCharacterData(endChild)
          ? sliceData(endChild, 0, endOffset, target)
          : partialClone(endChild, [endChild, 0, endContainer, endOffset], target)
      );
    }
    return fragment;
  }

  function partialClone(node, bounds, target) {
    const clone = target.importNode(node, false);
    clone.append(cloneSpan(...bounds, target));
    return clone;
  }

  function isCharacterData(node) {
    return node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE || node.nodeType === Node.COMMENT_NODE;
  }

  function sliceData(node, start, end, target) {
    const clone = target.importNode(node, false);
    clone.data = node.data.slice(start, end);
    return clone;
  }

  function commonAncestor(first, second) {
    const ancestors = new Set();
    for (let node = first; node; node = node.parentNode) ancestors.add(node);
    let node = second;
    while (!ancestors.has(node)) node = node.parentNode;
    return node;
  }

  function childToward(ancestor, node) {
    let child = node;
    while (child.parentNode !== ancestor) child = child.parentNode;
    return child;
  }

  function markHidden(range, marked) {
    const { commonAncestorContainer: common, startContainer, startOffset, endContainer, endOffset } = range;
    if (isCharacterData(common)) return;
    const first = startContainer === common ? common.childNodes[startOffset] : childToward(common, startContainer);
    const last = endContainer === common ? common.childNodes[endOffset - 1] : childToward(common, endContainer);
    for (let node = first; node; node = node.nextSibling) {
      if (node.nodeType === Node.ELEMENT_NODE) markSubtree(node, marked);
      if (node === last) break;
    }
  }

  function markSubtree(root, marked) {
    const stack = [root];
    while (stack.length) {
      const element = stack.pop();
      if (isHidden(element)) {
        element.setAttribute(HIDDEN_ATTRIBUTE, "");
        marked.push(element);
      } else {
        stack.push(...WMExt.markdown.elementsOf(element));
      }
    }
  }

  function isHidden(element) {
    if (WMExt.cleaner.isStaticallyHidden(element)) return true;
    if (typeof element.checkVisibility !== "function") return false;
    if (element.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
    return !element.closest("details:not([open])") && getComputedStyle(element).display !== "contents";
  }

  function ancestorShells(range, wrapper) {
    const ancestors = [];
    let insideList = false;
    let insideTable = false;
    const common = range.commonAncestorContainer;
    for (let element = isCharacterData(common) ? common.parentElement : common; element; element = element.parentElement) {
      const tag = element.localName;
      if (tag === "body" || tag === "html") break;
      if (!WRAPPER_TAGS.has(tag) || (insideList && LIST_TAGS.has(tag)) || (insideTable && TABLE_TAGS.has(tag))) continue;
      ancestors.push(element);
      insideList ||= tag === "ul" || tag === "ol";
      insideTable ||= tag === "table";
    }

    let parent = wrapper;
    for (const element of ancestors.reverse()) {
      const shell = wrapper.ownerDocument.importNode(element, false);
      for (const name of WRAPPER_DROPPED_ATTRIBUTES) shell.removeAttribute(name);
      shell.setAttribute(WMExt.cleaner.WRAP_ATTRIBUTE, "");
      if (element.localName === "ol") shell.setAttribute("start", String(listStart(element, range)));
      parent.append(shell);
      parent = shell;
    }
    return parent;
  }

  function numberStartLists(range, fragment) {
    const chain = [];
    for (let node = range.startContainer; node !== range.commonAncestorContainer; node = node.parentNode) chain.push(node);
    let clone = fragment.firstChild;
    for (let index = chain.length - 1; index >= 0 && clone; index -= 1) {
      if (chain[index].localName === "ol") clone.setAttribute("start", String(listStart(chain[index], range)));
      clone = clone.firstChild;
    }
  }

  function listStart(list, range) {
    const declared = Number.parseInt(list.getAttribute("start"), 10);
    const start = Number.isNaN(declared) ? 1 : declared;
    const { startContainer, startOffset } = range;
    const anchor = startContainer === list ? list.childNodes[startOffset] : childToward(list, startContainer);
    let number = start;
    let reached = false;
    for (let node = list.firstChild; node; node = node.nextSibling) {
      reached ||= node === anchor;
      if (node.localName !== "li") continue;
      const value = Number.parseInt(node.getAttribute("value"), 10);
      if (!Number.isNaN(value)) number = value;
      if (reached) return number;
      number += 1;
    }
    return start;
  }

  function topLevelTables(root) {
    return [...root.querySelectorAll("table")].filter((table) => !table.parentElement.closest("table"));
  }

  function tableToTsv(table) {
    const grid = WMExt.markdown.tableGrid(table);
    if (!grid) return "";
    const width = grid.reduce((max, row) => Math.max(max, row.length), 0);
    return grid.map((row) => Array.from({ length: width }, (_, index) => tsvCell(row[index])).join("\t")).join("\n");
  }

  function tsvCell(cell) {
    if (!cell) return "";
    const text = WMExt.markdown.textOf(cell).replace(/\s+/g, " ").trim();
    return text.startsWith("=") ? `'${text}` : text;
  }

  WMExt.extractor = { extract, tableToTsv };
})();
