import { describe, expect, it, vi } from "vitest";
import { createChrome, flush, loadInContext } from "../helpers/chrome.js";

const EXTRACTED = { ok: true, markdown: "## Dostawa\n\nKurier w 24 h.", text: "Dostawa Kurier w 24 h.", title: "Sklep", url: "https://example.com/faq", tables: [], warnings: [] };

function setup({ extract = EXTRACTED, frames = [{ frameId: 0, result: { size: 10, focused: true } }], settings = {}, clipboard = true, ...options } = {}) {
  const chrome = createChrome({ sync: { "wm-settings": settings }, ...options });
  const page = { engineLoaded: false };
  chrome.scripting.executeScript.mockImplementation(async ({ target, files, func, args }) => {
    if (target.allFrames && func === context.WMExt.injected.probeSelection) return frames;
    if (files) {
      page.engineLoaded = files.includes("src/extractor.js") || page.engineLoaded;
      return files.map(() => ({ frameId: target.frameIds?.[0] ?? 0 }));
    }
    if (func === context.WMExt.injected.copyInPage) return [{ result: true }];
    if (String(func).includes("engineVersion ===")) return [{ result: page.engineLoaded }];
    page.lastArgs = args;
    return [{ result: typeof extract === "function" ? extract() : extract }];
  });
  chrome.runtime.sendMessage.mockImplementation(async (message) => (message.target === "offscreen" ? clipboard : undefined));
  const context = loadInContext(["background.js"], { chrome });
  const send = (message, sender = {}) =>
    new Promise((resolve) => {
      const [keepOpen] = chrome.runtime.onMessage.dispatch(message, sender, resolve);
      if (!keepOpen) resolve(undefined);
    });
  return { chrome, context, page, send };
}

describe("background conversion", () => {
  it("converts from the popup, copies through the offscreen document and skips the session by default", async () => {
    const { chrome, page, send } = setup();
    const result = await send({ type: "WM_CONVERT", mode: "strict" });
    expect(result).toMatchObject({ ok: true, copied: true, wordCount: 5, tone: "success", message: "toastCopied(words(5))" });
    expect(page.lastArgs[0]).toEqual({ mode: "strict" });
    expect(chrome.offscreen.createDocument).toHaveBeenCalledWith(expect.objectContaining({ reasons: ["CLIPBOARD"] }));
    expect(chrome.storage.local.data["wm-session"]).toBeUndefined();
    expect(chrome.storage.session.data["wm-last-result"].markdown).toBe(EXTRACTED.markdown);
  });

  it("injects the engine only once per frame and version", async () => {
    const { chrome, send } = setup();
    await send({ type: "WM_CONVERT" });
    await send({ type: "WM_CONVERT" });
    const fileInjections = chrome.scripting.executeScript.mock.calls.filter(([options]) => options.files);
    expect(fileInjections).toHaveLength(1);
  });

  it("saves to the session, deduplicates and updates the badge", async () => {
    const { chrome, send } = setup({ settings: { collectMode: true } });
    const first = await send({ type: "WM_CONVERT" }, { tab: { id: 3 }, frameId: 2 });
    expect(first).toMatchObject({ added: true, count: 1, message: "toastCopiedAndSaved(words(5)|1)" });
    const second = await send({ type: "WM_CONVERT" }, { tab: { id: 3 }, frameId: 2 });
    expect(second).toMatchObject({ duplicate: true, count: 1, message: "toastDuplicate" });
    expect(chrome.storage.local.data["wm-session"].entries[0]).toMatchObject({ section: "Dostawa", title: "Sklep", domain: "example.com" });
    await flush();
    expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: "1" });
  });

  it("uses the frame that sent the button click", async () => {
    const { chrome, send } = setup();
    await send({ type: "WM_CONVERT" }, { tab: { id: 3 }, frameId: 5 });
    const targets = chrome.scripting.executeScript.mock.calls.map(([options]) => options.target);
    expect(targets.every((target) => target.tabId === 3 && target.frameIds?.[0] === 5)).toBe(true);
  });

  it("prefers the focused frame with a selection", async () => {
    const { chrome, send } = setup({
      frames: [
        { frameId: 0, result: { size: 50, focused: false } },
        { frameId: 4, result: { size: 3, focused: true } },
        { frameId: 6, result: { size: 0, focused: false } }
      ]
    });
    await send({ type: "WM_CONVERT" });
    expect(chrome.scripting.executeScript.mock.calls.at(-1)[0].target.frameIds).toEqual([4]);
  });

  it("reports missing selections and restricted pages clearly", async () => {
    const empty = setup({ frames: [{ frameId: 0, result: { size: 0, focused: true } }] });
    expect(await empty.send({ type: "WM_CONVERT" })).toMatchObject({ ok: false, error: "no-selection", message: "errorNoSelection" });

    const restricted = setup();
    restricted.chrome.scripting.executeScript.mockRejectedValue(new Error("Cannot access a chrome:// URL"));
    expect(await restricted.send({ type: "WM_CONVERT" })).toMatchObject({ ok: false, error: "restricted", message: "errorRestricted" });

    const file = setup();
    file.chrome.tabs.get.mockResolvedValue({ id: 7, url: "file:///tmp/a.html" });
    file.chrome.scripting.executeScript.mockRejectedValue(new Error("Cannot access contents of url"));
    expect(await file.send({ type: "WM_CONVERT" })).toMatchObject({ error: "file-access", message: "errorFileAccess" });
  });

  it("passes engine error codes through", async () => {
    const { send } = setup({ extract: { ok: false, error: "empty" } });
    expect(await send({ type: "WM_CONVERT" })).toMatchObject({ ok: false, error: "empty", message: "errorEmpty" });
  });

  it("falls back to copying inside the page when the offscreen copy fails", async () => {
    const { chrome, context, send } = setup({ clipboard: false });
    const result = await send({ type: "WM_CONVERT" });
    expect(result.copied).toBe(true);
    expect(chrome.scripting.executeScript).toHaveBeenCalledWith(expect.objectContaining({ func: context.WMExt.injected.copyInPage }));
  });

  it("warns when the result could not be copied at all", async () => {
    const { chrome, send } = setup({ clipboard: false });
    chrome.offscreen = undefined;
    const original = chrome.scripting.executeScript.getMockImplementation();
    chrome.scripting.executeScript.mockImplementation(async (options) => (String(options.func).includes("clipboard") ? [{ result: false }] : original(options)));
    expect(await send({ type: "WM_CONVERT" })).toMatchObject({ ok: true, copied: false, tone: "warning", message: "toastCopyFailed" });
  });

  it("still copies when saving to the session fails", async () => {
    const { send } = setup({ settings: { collectMode: true }, failLocalWrites: true });
    expect(await send({ type: "WM_CONVERT" })).toMatchObject({ ok: true, copied: true, saveFailed: true, message: "toastSaveFailed" });
  });
});

describe("background shortcut and context menu", () => {
  it("shows a toast in the top frame after the shortcut", async () => {
    const { chrome } = setup();
    chrome.commands.onCommand.dispatch("convert-selection", { id: 9 });
    await vi.waitFor(() => expect(chrome.tabs.sendMessage).toHaveBeenCalled());
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(9, expect.objectContaining({ type: "WM_TOAST", tone: "success" }), { frameId: 0 });
  });

  it("flags errors on the toolbar icon when the page cannot show a toast", async () => {
    const { chrome } = setup();
    chrome.scripting.executeScript.mockRejectedValue(new Error("Cannot access a chrome:// URL"));
    chrome.tabs.sendMessage.mockRejectedValue(new Error("Receiving end does not exist"));
    chrome.commands.onCommand.dispatch("convert-selection", { id: 9 });
    await vi.waitFor(() => expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "!" }));
    expect(chrome.action.setTitle).toHaveBeenCalledWith({ title: "errorRestricted" });
  });

  it("converts the frame the context menu was opened in", async () => {
    const { chrome } = setup();
    chrome.contextMenus.onClicked.dispatch({ menuItemId: "wm-convert-selection", frameId: 12 }, { id: 4 });
    await vi.waitFor(() => expect(chrome.tabs.sendMessage).toHaveBeenCalled());
    expect(chrome.scripting.executeScript.mock.calls.every(([options]) => options.target.frameIds?.[0] === 12)).toBe(true);
  });

  it("registers the context menu and injects the button into open tabs on install", async () => {
    const { chrome } = setup();
    chrome.tabs.query.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    chrome.runtime.onInstalled.dispatch({ reason: "install" });
    await vi.waitFor(() => expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(2));
    expect(chrome.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: "wm-convert-selection", contexts: ["selection"] }), expect.any(Function));
    expect(chrome.scripting.executeScript).toHaveBeenCalledWith({ target: { tabId: 1, allFrames: true }, files: ["src/settings.js", "src/content-script.js"] });
  });
});

describe("background session queue", () => {
  it("serializes concurrent writes without losing entries", async () => {
    const { chrome, send } = setup();
    await Promise.all(
      Array.from({ length: 5 }, (_, index) => send({ type: "WM_SESSION_ADD", result: { markdown: `Fragment ${index}`, url: `https://x.com/${index}` } }))
    );
    expect(chrome.storage.local.data["wm-session"].entries.map((entry) => entry.markdown)).toEqual([0, 1, 2, 3, 4].map((index) => `Fragment ${index}`));
  });

  it("removes, clears and restores entries", async () => {
    const { chrome, send } = setup();
    await send({ type: "WM_SESSION_ADD", result: { markdown: "A" } });
    await send({ type: "WM_SESSION_ADD", result: { markdown: "B" } });
    const entries = chrome.storage.local.data["wm-session"].entries;
    await send({ type: "WM_SESSION_REMOVE", id: entries[0].id });
    expect(chrome.storage.local.data["wm-session"].entries.map((entry) => entry.markdown)).toEqual(["B"]);
    await send({ type: "WM_SESSION_CLEAR" });
    expect(chrome.storage.local.data["wm-session"].entries).toEqual([]);
    await send({ type: "WM_SESSION_RESTORE", entries });
    expect(chrome.storage.local.data["wm-session"].entries).toHaveLength(2);
  });

  it("ignores messages addressed to the offscreen document", () => {
    const { chrome } = setup();
    const [keepOpen] = chrome.runtime.onMessage.dispatch({ target: "offscreen", type: "WM_CLIPBOARD_WRITE" }, {}, () => {});
    expect(keepOpen).toBe(false);
  });
});
