(function (global) {
  const WMExt = (global.WMExt = global.WMExt || {});

  const ALWAYS_REMOVE_TAGS = new Set([
    "script",
    "style",
    "noscript",
    "template",
    "iframe",
    "object",
    "embed",
    "canvas",
    "svg",
    "picture",
    "video",
    "audio",
    "source",
    "track",
    "button",
    "textarea",
    "select",
    "option",
    "optgroup",
    "form"
  ]);

  const SMART_REMOVE_TAGS = new Set([
    "nav",
    "aside",
    "dialog",
    "footer"
  ]);

  const JUNK_PATTERN =
    /(^|[\W_])(ad[sx]?|advert|advertising|promo|sponsor|sponsored|banner|popup|pop-up|modal|cookie|consent|gdpr|cmp|newsletter|subscribe|signup|sign-up|paywall|overlay|drawer|toast|tooltip|feedback|chat|interstitial|widget|share|social|related|recommend|recommended|breadcrumb|sidebar|menu|toolbar|sticky|fixed)([\W_]|$)/i;

  const STYLE_JUNK_PATTERN =
    /(display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0\b|position\s*:\s*fixed|position\s*:\s*sticky)/i;

  const SMART_ROLES = new Set([
    "dialog",
    "alertdialog",
    "presentation",
    "banner",
    "navigation",
    "complementary",
    "toolbar",
    "tooltip",
    "menu",
    "menuitem"
  ]);

  const CSS_TEXT_PATTERN =
    /(@media|@supports|@container|:root\s*\{|--[a-z0-9_-]+\s*:|[.#]?[a-z0-9_-]+(?:\s+[a-z0-9_.#:-]+)*\s*\{[^}]*:[^}]*;)/i;

  const BLOCKISH_TAGS = new Set([
    "div",
    "section",
    "article",
    "p",
    "span",
    "td",
    "th",
    "li"
  ]);

  function preserveMeaningfulMedia(root) {
    const images = Array.from(root.querySelectorAll("img"));
    images.forEach((image) => {
      if (!root.contains(image)) {
        return;
      }

      const alt = (image.getAttribute("alt") || "").replace(/\s+/g, " ").trim();
      if (!alt) {
        image.remove();
        return;
      }

      const marker = global.document.createElement("span");
      marker.setAttribute("data-wm-image-alt", alt);
      if (image.currentSrc || image.src || image.getAttribute("src")) {
        marker.setAttribute("data-wm-image-src", image.currentSrc || image.src || image.getAttribute("src"));
      }
      marker.textContent = alt;
      image.replaceWith(marker);
    });

    const inputs = Array.from(root.querySelectorAll("input[type='checkbox'], input[type='radio']"));
    inputs.forEach((input) => {
      if (!root.contains(input)) {
        return;
      }

      const marker = global.document.createElement("span");
      marker.setAttribute("data-wm-checkbox", input.checked ? "checked" : "unchecked");
      marker.textContent = input.checked ? "[x]" : "[ ]";
      input.replaceWith(marker);
    });
  }

  function getElementSignature(element) {
    const parts = [
      element.id || "",
      element.className || "",
      element.getAttribute("role") || "",
      element.getAttribute("aria-label") || "",
      element.getAttribute("aria-describedby") || "",
      element.getAttribute("title") || "",
      element.getAttribute("name") || "",
      element.getAttribute("data-testid") || "",
      element.getAttribute("data-test") || ""
    ];

    return parts.filter(Boolean).join(" ");
  }

  function shouldRemoveBySignature(element) {
    return JUNK_PATTERN.test(getElementSignature(element));
  }

  function shouldRemoveByStyle(element) {
    const style = element.getAttribute("style");
    return style ? STYLE_JUNK_PATTERN.test(style) : false;
  }

  function hasSemanticContent(element) {
    const tag = element.tagName.toLowerCase();

    return (
      /^h[1-6]$/.test(tag) ||
      tag === "table" ||
      tag === "thead" ||
      tag === "tbody" ||
      tag === "tfoot" ||
      tag === "tr" ||
      tag === "th" ||
      tag === "td" ||
      tag === "ul" ||
      tag === "ol" ||
      tag === "li" ||
      tag === "p" ||
      tag === "pre" ||
      tag === "code" ||
      tag === "blockquote"
    );
  }

  function looksLikeMostlyLinks(element) {
    const text = (element.textContent || "").trim();
    if (text.length < 40) {
      return false;
    }

    const links = Array.from(element.querySelectorAll("a"));
    if (!links.length) {
      return false;
    }

    const linkedTextLength = links.reduce((sum, link) => sum + (link.textContent || "").trim().length, 0);
    return linkedTextLength / Math.max(text.length, 1) > 0.7 && links.length >= 2;
  }

  function removeEmptyNoise(root) {
    const elements = Array.from(root.querySelectorAll("*")).reverse();

    elements.forEach((element) => {
      if (!root.contains(element)) {
        return;
      }

      if (hasSemanticContent(element)) {
        return;
      }

      const text = (element.textContent || "").trim();
      if (!text && element.children.length === 0) {
        element.remove();
        return;
      }

      if (text.length <= 1 && element.children.length === 0) {
        element.remove();
      }
    });
  }

  function isCodeContext(node) {
    const element = node.parentElement;
    return Boolean(element && element.closest("pre, code"));
  }

  function looksLikeCssText(text) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    if (value.length < 40) {
      return false;
    }

    const braceCount = (value.match(/[{}]/g) || []).length;
    const semicolonCount = (value.match(/;/g) || []).length;
    const colonCount = (value.match(/:/g) || []).length;

    if (!CSS_TEXT_PATTERN.test(value)) {
      return false;
    }

    return braceCount >= 2 || semicolonCount >= 2 || colonCount >= 4;
  }

  function findCssBlockContainer(node, root) {
    let current = node.parentElement;

    while (current && current !== root) {
      if (BLOCKISH_TAGS.has(current.tagName.toLowerCase())) {
        return current;
      }
      current = current.parentElement;
    }

    return null;
  }

  function removeCssLikeText(root) {
    const walker = global.document.createTreeWalker(root, global.NodeFilter.SHOW_TEXT);
    const targets = [];
    let current;

    while ((current = walker.nextNode())) {
      if (isCodeContext(current)) {
        continue;
      }

      if (!looksLikeCssText(current.textContent || "")) {
        continue;
      }

      const container = findCssBlockContainer(current, root);
      if (container) {
        targets.push(container);
        continue;
      }

      targets.push(current);
    }

    targets.forEach((target) => {
      if (target && (target === root || root.contains(target))) {
        target.remove();
      }
    });
  }

  function sanitizeSelectionContainer(container, options) {
    const mode = options?.mode === "strict" ? "strict" : "smart";
    preserveMeaningfulMedia(container);
    const elements = [container, ...container.querySelectorAll("*")];

    elements.forEach((element) => {
      if (!(element instanceof global.Element)) {
        return;
      }

      if (element !== container && !container.contains(element)) {
        return;
      }

      const tag = element.tagName.toLowerCase();
      const role = (element.getAttribute("role") || "").toLowerCase();
      const ariaHidden = element.getAttribute("aria-hidden");

      if (tag === "input") {
        element.remove();
        return;
      }

      if (tag === "img") {
        element.remove();
        return;
      }

      if (ALWAYS_REMOVE_TAGS.has(tag)) {
        element.remove();
        return;
      }

      if (element.hasAttribute("hidden") || ariaHidden === "true") {
        element.remove();
        return;
      }

      if (mode !== "smart") {
        return;
      }

      if (SMART_REMOVE_TAGS.has(tag) || SMART_ROLES.has(role)) {
        element.remove();
        return;
      }

      if (shouldRemoveBySignature(element) || shouldRemoveByStyle(element)) {
        element.remove();
        return;
      }

      if (looksLikeMostlyLinks(element) && !hasSemanticContent(element)) {
        element.remove();
      }
    });

    if (mode === "smart") {
      removeCssLikeText(container);
      removeEmptyNoise(container);
    }

    return container;
  }

  WMExt.cleaner = {
    sanitizeSelectionContainer
  };
})(window);
