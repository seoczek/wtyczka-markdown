(() => {
  const WMExt = (globalThis.WMExt ??= {});

  const WRAP_ATTRIBUTE = "data-wm-wrap";
  const SUBSTANTIAL_TEXT = 200;
  const LINK_LIST_MIN_ITEMS = 4;
  const LINK_LIST_MAX_ITEM = 40;
  const LINK_LIST_MAX_AVERAGE = 24;
  const LINK_LIST_RATIO = 0.9;

  const REMOVED_TAGS = new Set([
    "audio", "canvas", "dialog", "embed", "iframe", "map", "noscript", "object", "script", "source",
    "style", "svg", "template", "textarea", "track", "video"
  ]);
  const STRICT_TAGS = new Set(["aside", "footer", "nav"]);
  const CONTAINER_TAGS = new Set([
    "article", "aside", "div", "figure", "footer", "form", "header", "ins", "li", "nav", "ol", "section", "ul"
  ]);
  const CONTENT_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "ol", "p", "pre", "table", "ul"]);
  const MAJOR_HEADINGS = new Set(["h1", "h2"]);

  const REMOVED_ROLES = new Set(["alertdialog", "dialog", "toolbar", "tooltip"]);
  const STRICT_ROLES = new Set(["complementary", "contentinfo", "menu", "menubar", "navigation"]);

  const SCREEN_READER_CLASSES = new Set([
    "a11y-hidden", "element-invisible", "screen-reader-only", "screen-reader-text", "screenreader",
    "sr-only", "visually-hidden", "visuallyhidden"
  ]);
  const CONSENT_VENDORS =
    /cookiebot|onetrust|ot-sdk|cookieyes|cky-consent|usercentrics|didomi|cc-window|cc-banner|cmplz|iubenda|qc-cmp|truste|osano|borlabs|cookie-law-info|cookie-notice|cookieconsent|cookie-consent|moove-gdpr/;
  const CONSENT_TOKENS = new Set(["cmp", "consent", "cookie", "cookies", "gdpr"]);
  const JUNK_TOKENS = new Set([
    "ad", "ads", "adsbygoogle", "adslot", "adunit", "advert", "advertisement", "advertising", "banner",
    "interstitial", "modal", "newsletter", "overlay", "paywall", "popup", "promo", "share", "sharing",
    "sidebar", "signup", "social", "sponsor", "sponsored", "subscribe", "toast", "toolbar", "tooltip"
  ]);
  const STRICT_TOKENS = new Set([
    "breadcrumb", "breadcrumbs", "comments", "footer", "menu", "navbar", "recommended", "related", "widget"
  ]);
  const UI_BUTTON_TOKENS = new Set([
    "burger", "close", "copy", "dismiss", "hamburger", "like", "next", "prev", "print", "share", "toggle"
  ]);
  const TOKEN_SEPARATOR = /[\s_-]+/;
  const HIDDEN_STYLE =
    /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse)|opacity\s*:\s*(?:0|0?\.0+|0%))\s*(?:!\s*important\s*)?(?:;|$)/i;

  function sanitize(root, { mode = "smart" } = {}) {
    const strict = mode === "strict";
    const warnings = new Set();
    const stack = elementsOf(root);
    while (stack.length) {
      const element = stack.pop();
      const verdict = judge(element, strict);
      if (!verdict) {
        stack.push(...elementsOf(element));
        continue;
      }
      if (verdict === "hidden" && element.textContent.trim()) warnings.add("hidden-content-skipped");
      element.remove();
    }
    if (strict) removeLinkLists(root);
    return { warnings: [...warnings] };
  }

  function judge(element, strict) {
    if (element.hasAttribute(WRAP_ATTRIBUTE)) return "";
    const tag = element.localName;
    if (REMOVED_TAGS.has(tag)) return "junk";
    if (isStaticallyHidden(element)) return "hidden";
    if (element.getAttribute("aria-hidden") === "true") return "junk";
    if (tag === "button") return isUiButton(element) ? "junk" : "";
    if (tag === "input") return isChoice(element) ? "" : "junk";

    const role = element.getAttribute("role");
    if (REMOVED_ROLES.has(role)) return "junk";
    if (strict && (STRICT_ROLES.has(role) || STRICT_TAGS.has(tag)) && !isQuoteAttribution(element)) return "junk";
    if (!CONTAINER_TAGS.has(tag)) return "";

    const tokens = tokensOf(element);
    const junk = tokens.some((token) => JUNK_TOKENS.has(token) || (strict && STRICT_TOKENS.has(token)));
    return junk && !hasSubstantialContent(element) ? "junk" : "";
  }

  function isStaticallyHidden(element) {
    if (element.hasAttribute("hidden")) return true;
    const style = element.getAttribute("style");
    if (style && HIDDEN_STYLE.test(style)) return true;
    return WMExt.markdown.classesOf(element).some((name) => SCREEN_READER_CLASSES.has(name)) || isConsentBanner(element);
  }

  function isConsentBanner(element) {
    const signature = `${element.id} ${element.getAttribute("class") ?? ""}`.toLowerCase();
    if (signature.length < 3) return false;
    if (CONSENT_VENDORS.test(signature)) return true;
    return (
      CONTAINER_TAGS.has(element.localName) &&
      signature.split(TOKEN_SEPARATOR).some((token) => CONSENT_TOKENS.has(token)) &&
      !hasSubstantialContent(element)
    );
  }

  function tokensOf(element) {
    const signature = `${element.id} ${element.getAttribute("class") ?? ""}`.trim().toLowerCase();
    return signature ? signature.split(TOKEN_SEPARATOR) : [];
  }

  function hasSubstantialContent(element) {
    let hasContent = false;
    for (const child of element.querySelectorAll("h1, h2, h3, h4, h5, h6, p, pre, table, ul, ol")) {
      if (MAJOR_HEADINGS.has(child.localName)) return true;
      hasContent ||= CONTENT_TAGS.has(child.localName);
    }
    return hasContent && element.textContent.trim().length >= SUBSTANTIAL_TEXT;
  }

  function isUiButton(element) {
    if (!element.textContent.trim()) return true;
    return tokensOf(element).some((token) => UI_BUTTON_TOKENS.has(token));
  }

  function isChoice(element) {
    const type = element.getAttribute("type")?.toLowerCase();
    return type === "checkbox" || type === "radio";
  }

  function isQuoteAttribution(element) {
    return element.localName !== "nav" && element.parentElement?.closest("blockquote, figure") != null;
  }

  function removeLinkLists(root) {
    const rootText = root.textContent.trim().length;
    const stats = new Map();
    const order = [];
    const stack = [root];
    while (stack.length) {
      const element = stack.pop();
      order.push(element);
      stack.push(...elementsOf(element));
    }

    for (let index = order.length - 1; index >= 0; index -= 1) {
      const element = order[index];
      const own = collectStats(element, stats);
      stats.set(element, own);
      if (element !== root && isLinkList(element, own, rootText)) element.remove();
    }
  }

  function collectStats(element, stats) {
    const own = { text: 0, linkText: 0 };
    for (let child = element.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 3) {
        own.text += child.data.trim().length;
      } else if (stats.has(child)) {
        const inner = stats.get(child);
        own.text += inner.text;
        own.linkText += child.localName === "a" ? inner.text : inner.linkText;
      }
    }
    return own;
  }

  function isLinkList(element, own, rootText) {
    const tag = element.localName;
    if ((tag !== "ul" && tag !== "ol" && tag !== "div") || element.hasAttribute(WRAP_ATTRIBUTE)) return false;
    if (!own.text || own.linkText / own.text < LINK_LIST_RATIO || own.text >= rootText * LINK_LIST_RATIO) return false;

    const items = elementsOf(element);
    if (items.length < LINK_LIST_MIN_ITEMS) return false;
    const lengths = items.map((item) => item.textContent.trim().length);
    const total = lengths.reduce((sum, length) => sum + length, 0);
    return Math.max(...lengths) <= LINK_LIST_MAX_ITEM && total / items.length <= LINK_LIST_MAX_AVERAGE;
  }

  function elementsOf(element) {
    return WMExt.markdown.elementsOf(element);
  }

  WMExt.cleaner = {
    WRAP_ATTRIBUTE,
    isStaticallyHidden,
    sanitize
  };
})();
