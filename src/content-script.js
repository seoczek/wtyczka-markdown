(() => {
  const WMExt = (globalThis.WMExt ??= {});
  const TAKEOVER_EVENT = "wm-markdown:takeover";
  const BUTTON_SIZE = 30;
  const GAP = 6;
  const TOAST_MS = 2600;
  const STYLES = `
    :host { all: initial; }
    button {
      position: fixed; top: 0; left: 0; box-sizing: border-box;
      width: ${BUTTON_SIZE}px; height: ${BUTTON_SIZE}px; margin: 0; padding: 0;
      border: 1px solid rgb(255 255 255 / 0.25); border-radius: 9px;
      background: #1f5f4a; color: #fff; cursor: pointer;
      font: 700 11px/1 system-ui, -apple-system, "Segoe UI", sans-serif; letter-spacing: 0.02em;
      box-shadow: 0 6px 18px rgb(0 0 0 / 0.22);
      transition: background-color 120ms ease, transform 120ms ease;
    }
    button:hover { background: #184a39; transform: scale(1.06); }
    button:active { transform: scale(0.96); }
    button[hidden] { display: none; }
    .toast {
      position: fixed; right: 16px; bottom: 16px; max-width: min(360px, calc(100vw - 32px));
      padding: 11px 14px; border-radius: 12px; background: #1a231f; color: #f7f4ee;
      font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
      box-shadow: 0 16px 40px rgb(0 0 0 / 0.28);
      opacity: 0; translate: 0 8px; pointer-events: none;
      transition: opacity 160ms ease, translate 160ms ease;
    }
    .toast.visible { opacity: 1; translate: 0 0; }
    .toast[data-tone="error"] { background: #7f1d1d; }
    .toast[data-tone="warning"] { background: #78350f; }
    @media (prefers-reduced-motion: reduce) { button, .toast { transition: none; } }
  `;

  const alive = () => Boolean(globalThis.chrome?.runtime?.id);
  if (WMExt.stub?.alive()) return;
  WMExt.stub?.teardown();
  document.dispatchEvent(new CustomEvent(TAKEOVER_EVENT));

  const t = (key, substitutions) => chrome.i18n.getMessage(key, substitutions);
  const controller = new AbortController();
  const { signal } = controller;
  const ui = { host: null, button: null, toast: null };
  let prefs = null;
  let prefsLoading = null;
  let snapshot = null;
  let pointerDown = false;
  let dismissed = false;
  let frame = 0;
  let toastTimer = 0;

  function topHostname() {
    const origins = location.ancestorOrigins;
    const origin = origins?.length ? origins[origins.length - 1] : location.origin;
    try {
      return new URL(origin).hostname;
    } catch {
      return location.hostname;
    }
  }

  function loadPrefs() {
    prefsLoading ??= WMExt.settings.load().then((value) => (prefs = value));
    return prefsLoading;
  }

  function buttonAllowed() {
    return prefs.showButton && !WMExt.settings.isExcluded(topHostname(), prefs.excludedDomains);
  }

  function ensureUi() {
    if (ui.host?.isConnected) return ui;
    const host = document.createElement("wm-markdown-ui");
    host.style.cssText = "all:initial!important;position:fixed!important;top:0!important;left:0!important;width:0!important;height:0!important;z-index:2147483647!important;";
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `<style>${STYLES}</style><button type="button" tabindex="-1" hidden>MD</button><div class="toast" role="status" aria-live="polite"></div>`;
    ui.button = root.querySelector("button");
    ui.toast = root.querySelector(".toast");
    ui.button.title = t("buttonTitle");
    ui.button.setAttribute("aria-label", t("buttonTitle"));
    ui.button.addEventListener("pointerdown", (event) => event.preventDefault(), { signal });
    ui.button.addEventListener("click", onButtonClick, { signal });
    document.documentElement.append(host);
    ui.host = host;
    return ui;
  }

  function isOwnEvent(event) {
    return Boolean(ui.host) && event.composedPath().includes(ui.host);
  }

  function readSelection() {
    const selection = getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return null;
    const text = selection.toString();
    return text.trim() ? { selection, range: selection.getRangeAt(0), text } : null;
  }

  function isBackward({ anchorNode, anchorOffset, focusNode, focusOffset }) {
    if (anchorNode === focusNode) return focusOffset < anchorOffset;
    return Boolean(anchorNode.compareDocumentPosition(focusNode) & Node.DOCUMENT_POSITION_PRECEDING);
  }

  function edgeRect(selection) {
    const range = selection.getRangeAt(selection.rangeCount - 1);
    const rects = [...range.getClientRects()].filter((rect) => rect.width || rect.height);
    if (!rects.length) return range.getBoundingClientRect();
    return isBackward(selection) ? { ...rects[0].toJSON(), backward: true } : rects.at(-1);
  }

  function place(selection) {
    const rect = edgeRect(selection);
    const x = rect.backward ? rect.left - BUTTON_SIZE - GAP : rect.right + GAP;
    const y = rect.backward ? rect.top - BUTTON_SIZE - GAP : rect.bottom + GAP;
    const clamp = (value, max) => Math.min(Math.max(value, GAP), max - BUTTON_SIZE - GAP);
    ui.button.style.translate = `${clamp(x, innerWidth)}px ${clamp(y, innerHeight)}px`;
  }

  const trackOptions = { passive: true, capture: true };
  let tracking = null;

  function showButton(selection) {
    ensureUi();
    place(selection);
    ui.button.hidden = false;
    if (tracking) return;
    tracking = new AbortController();
    const options = { ...trackOptions, signal: AbortSignal.any([signal, tracking.signal]) };
    addEventListener("scroll", schedule, options);
    addEventListener("resize", schedule, options);
  }

  function hideButton() {
    if (ui.button) ui.button.hidden = true;
    tracking?.abort();
    tracking = null;
  }

  function schedule() {
    frame ||= requestAnimationFrame(update);
  }

  async function update() {
    frame = 0;
    if (!alive()) return teardown();
    const current = readSelection();
    if (current) snapshot = { range: current.range.cloneRange(), text: current.text };
    else if (document.hasFocus()) snapshot = null;

    if (!current || pointerDown || dismissed) return hideButton();
    if (!prefs) await loadPrefs();
    if (buttonAllowed() && readSelection()) showButton(current.selection);
    else hideButton();
  }

  function getSnapshot() {
    const range = snapshot?.range;
    return range?.startContainer.isConnected && range.endContainer.isConnected ? snapshot : null;
  }

  async function onButtonClick(event) {
    if (!event.isTrusted) return;
    if (!alive()) return teardown();
    hideButton();
    const response = await chrome.runtime.sendMessage({ type: "WM_CONVERT" }).catch(() => null);
    showToast(response?.message ?? t("errorGeneric"), response?.tone ?? "error");
  }

  function showToast(message, tone) {
    if (!message) return;
    const { toast } = ensureUi();
    toast.textContent = message;
    toast.dataset.tone = tone;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), TOAST_MS);
  }

  function onMessage(message) {
    if (message?.type === "WM_TOAST") showToast(message.message, message.tone);
    return false;
  }

  function onSettingsChanged(changes, area) {
    if (area !== "sync" || !changes[WMExt.settings.STORAGE_KEY]) return;
    prefs = WMExt.settings.normalize(changes[WMExt.settings.STORAGE_KEY].newValue);
    if (!buttonAllowed()) hideButton();
  }

  function teardown() {
    controller.abort();
    tracking = null;
    cancelAnimationFrame(frame);
    clearTimeout(toastTimer);
    ui.host?.remove();
    try {
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.storage.onChanged.removeListener(onSettingsChanged);
    } catch {
      /* extension context already invalidated */
    }
    if (WMExt.stub?.teardown === teardown) delete WMExt.stub;
  }

  document.addEventListener("selectionchange", () => {
    dismissed = false;
    if (!pointerDown) schedule();
  }, { signal });
  document.addEventListener("pointerdown", (event) => {
    if (isOwnEvent(event)) return;
    pointerDown = event.button === 0;
    if (pointerDown) hideButton();
  }, { signal, capture: true });
  addEventListener("pointerup", () => {
    if (!pointerDown) return;
    pointerDown = false;
    schedule();
  }, { signal, capture: true });
  addEventListener("pointercancel", () => (pointerDown = false), { signal, capture: true });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && ui.button && !ui.button.hidden) {
      dismissed = true;
      hideButton();
    }
  }, { signal, capture: true });
  document.addEventListener(TAKEOVER_EVENT, teardown, { signal, once: true });

  chrome.runtime.onMessage.addListener(onMessage);
  chrome.storage.onChanged.addListener(onSettingsChanged);

  WMExt.stub = { alive, getSnapshot, teardown };
})();
