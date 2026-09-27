import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { createChrome, flush } from "../helpers/chrome.js";

const RECT = { left: 100, top: 50, right: 180, bottom: 70, width: 80, height: 20 };

function setup({ settings = {}, url = "https://example.com/article", focused = true } = {}) {
  const dom = new JSDOM(`<!doctype html><body><p id="p">Pierwszy akapit tekstu.</p><p id="q">Drugi akapit.</p></body>`, {
    url,
    pretendToBeVisual: true,
    runScripts: "outside-only"
  });
  const win = dom.window;
  const chrome = createChrome({ sync: { "wm-settings": settings } });
  win.chrome = chrome;
  win.Range.prototype.getClientRects = () => [{ ...RECT, toJSON: () => RECT }];
  win.Range.prototype.getBoundingClientRect = () => RECT;
  win.document.hasFocus = () => focused;
  const attachShadow = win.Element.prototype.attachShadow;
  win.Element.prototype.attachShadow = function (init) {
    return attachShadow.call(this, { ...init, mode: "open" });
  };
  const clickHandlers = [];
  const addEventListener = win.EventTarget.prototype.addEventListener;
  win.HTMLButtonElement.prototype.addEventListener = function (type, handler, options) {
    if (type === "click") clickHandlers.push(handler);
    return addEventListener.call(this, type, handler, options);
  };
  for (const file of ["src/settings.js", "src/content-script.js"]) win.eval(readFileSync(file, "utf8"));

  const host = () => win.document.querySelector("wm-markdown-ui");
  const button = () => host()?.shadowRoot.querySelector("button");
  const toast = () => host()?.shadowRoot.querySelector(".toast");
  const nextFrame = () => new Promise((resolve) => win.requestAnimationFrame(() => setTimeout(resolve, 0)));

  async function select(id = "p") {
    const range = win.document.createRange();
    range.selectNodeContents(win.document.getElementById(id));
    win.document.body.dispatchEvent(new win.PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    const selection = win.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    win.dispatchEvent(new win.PointerEvent("pointerup", { bubbles: true }));
    await nextFrame();
    await flush();
  }

  const trustedClick = () => clickHandlers.at(-1)({ isTrusted: true, preventDefault() {}, stopPropagation() {} });

  return { win, chrome, host, button, toast, select, nextFrame, trustedClick };
}

describe("content script button", () => {
  it("creates its UI lazily and shows the button after a selection", async () => {
    const env = setup();
    expect(env.host()).toBeNull();
    await env.select();
    expect(env.button().hidden).toBe(false);
    expect(env.button().style.translate).toBe("186px 76px");
    expect(env.button().getAttribute("aria-label")).toBe("buttonTitle");
    expect(env.win.WMExt.stub.getSnapshot().text).toBe("Pierwszy akapit tekstu.");
  });

  it("keeps the button hidden while the pointer is down", async () => {
    const env = setup();
    await env.select();
    env.win.document.body.dispatchEvent(new env.win.PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    env.win.document.dispatchEvent(new env.win.Event("selectionchange"));
    await env.nextFrame();
    expect(env.button().hidden).toBe(true);
  });

  it("respects the showButton setting and excluded domains", async () => {
    const off = setup({ settings: { showButton: false } });
    await off.select();
    expect(off.button()?.hidden ?? true).toBe(true);

    const excluded = setup({ settings: { excludedDomains: ["example.com"] }, url: "https://blog.example.com/x" });
    await excluded.select();
    expect(excluded.button()?.hidden ?? true).toBe(true);
    expect(excluded.win.WMExt.stub.getSnapshot()).not.toBeNull();
  });

  it("hides immediately when settings change", async () => {
    const env = setup();
    await env.select();
    await env.chrome.storage.sync.set({ "wm-settings": { excludedDomains: ["example.com"] } });
    expect(env.button().hidden).toBe(true);
  });

  it("hides on Escape until the selection changes", async () => {
    const env = setup();
    await env.select();
    env.win.document.dispatchEvent(new env.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(env.button().hidden).toBe(true);
    await env.select("q");
    expect(env.button().hidden).toBe(false);
  });

  it("ignores synthetic clicks and converts on trusted ones", async () => {
    const env = setup();
    env.chrome.runtime.sendMessage.mockResolvedValue({ ok: true, message: "toastCopied(words(3))", tone: "success" });
    await env.select();
    env.button().click();
    await flush();
    expect(env.chrome.runtime.sendMessage).not.toHaveBeenCalled();

    env.trustedClick();
    await vi.waitFor(() => expect(env.toast().textContent).toBe("toastCopied(words(3))"));
    expect(env.chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "WM_CONVERT" });
    expect(env.toast().dataset.tone).toBe("success");
    expect(env.toast().getAttribute("role")).toBe("status");
  });

  it("shows toasts requested by the service worker", () => {
    const env = setup();
    env.chrome.runtime.onMessage.dispatch({ type: "WM_TOAST", message: "errorNoSelection", tone: "error" });
    expect(env.toast().textContent).toBe("errorNoSelection");
    expect(env.toast().classList.contains("visible")).toBe(true);
  });

  it("drops the snapshot when the user deselects but keeps it when focus is lost", async () => {
    const env = setup();
    await env.select();
    env.win.getSelection().removeAllRanges();
    env.win.document.dispatchEvent(new env.win.Event("selectionchange"));
    await env.nextFrame();
    expect(env.win.WMExt.stub.getSnapshot()).toBeNull();

    const blurred = setup({ focused: false });
    await blurred.select();
    blurred.win.getSelection().removeAllRanges();
    blurred.win.document.dispatchEvent(new blurred.win.Event("selectionchange"));
    await blurred.nextFrame();
    expect(blurred.win.WMExt.stub.getSnapshot().text).toBe("Pierwszy akapit tekstu.");
  });

  it("tears down when a newer copy takes over or the extension context dies", async () => {
    const env = setup();
    await env.select();
    env.win.document.dispatchEvent(new env.win.CustomEvent("wm-markdown:takeover"));
    expect(env.host()).toBeNull();
    expect(env.win.WMExt.stub).toBeUndefined();

    const orphan = setup();
    await orphan.select();
    orphan.chrome.runtime.id = undefined;
    orphan.win.document.dispatchEvent(new orphan.win.Event("selectionchange"));
    await orphan.nextFrame();
    expect(orphan.host()).toBeNull();
  });

  it("does not initialize twice in the same live context", () => {
    const env = setup();
    const stub = env.win.WMExt.stub;
    env.win.eval(readFileSync("src/content-script.js", "utf8"));
    expect(env.win.WMExt.stub).toBe(stub);
  });
});
