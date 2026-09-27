importScripts("src/settings.js", "src/session.js", "src/injected.js");

const { settings, session, injected } = globalThis.WMExt;
const t = (key, substitutions) => chrome.i18n.getMessage(key, substitutions);

const MENU_ID = "wm-convert-selection";
const LAST_RESULT_KEY = "wm-last-result";
const ENGINE_FILES = ["src/cleaner.js", "src/markdown.js", "src/extractor.js"];
const VERSION = chrome.runtime.getManifest().version;
const BADGE_COLOR = "#1f5f4a";
const ERROR_COLOR = "#b3261e";
const ERROR_BADGE_MS = 4000;

chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
chrome.action.setBadgeTextColor?.({ color: "#ffffff" });

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_ID, title: t("menuConvert"), contexts: ["selection"] }, () => void chrome.runtime.lastError);
  });
  injectIntoOpenTabs();
  refreshBadge();
});

chrome.runtime.onStartup.addListener(() => refreshBadge());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[session.SESSION_KEY]) {
    refreshBadge(session.normalize(changes[session.SESSION_KEY].newValue).entries.length);
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && tab?.id != null) {
    convertAndNotify({ tabId: tab.id, frameId: info.frameId ?? 0, trigger: "menu" });
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "convert-selection") return;
  const target = tab?.id != null ? tab : await getActiveTab();
  if (target?.id != null) convertAndNotify({ tabId: target.id, trigger: "shortcut" });
});

const handlers = {
  async WM_CONVERT(message, sender) {
    if (sender.tab?.id != null) {
      return convert({ tabId: sender.tab.id, frameId: sender.frameId ?? 0, trigger: "button" });
    }
    const tab = await getActiveTab();
    if (tab?.id == null) return failure("restricted");
    return convert({ tabId: tab.id, trigger: "popup", mode: message.mode, collect: message.collect });
  },
  async WM_SESSION_ADD(message) {
    const saved = await appendToSession(message.result, message.result?.mode);
    return { ok: true, ...saved };
  },
  async WM_SESSION_REMOVE(message) {
    await mutateSession((current) => ({ entries: current.entries.filter((entry) => entry.id !== message.id) }));
    return { ok: true };
  },
  async WM_SESSION_CLEAR() {
    await mutateSession(() => ({ entries: [] }));
    return { ok: true };
  },
  async WM_SESSION_RESTORE(message) {
    await mutateSession(() => ({ entries: Array.isArray(message.entries) ? message.entries : [] }));
    return { ok: true };
  },
  async WM_COPY(message) {
    return { ok: await writeClipboard(message.text) };
  }
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = message?.target ? null : handlers[message?.type];
  if (!handler) return false;
  handler(message, sender)
    .catch((error) => failure("engine", String(error?.message ?? error)))
    .then(sendResponse);
  return true;
});

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

async function convertAndNotify(request) {
  const result = await convert(request);
  const delivered = await chrome.tabs
    .sendMessage(request.tabId, { type: "WM_TOAST", message: result.message, tone: result.tone }, { frameId: 0 })
    .then(() => true, () => false);
  if (!result.ok && !delivered) flashError(result.message);
}

async function convert({ tabId, frameId, trigger, mode, collect }) {
  const prefs = await settings.load();
  const activeMode = mode === "strict" || mode === "smart" ? mode : prefs.mode;
  const extracted = await extractFromTab(tabId, frameId, activeMode);
  if (!extracted.ok) return extracted;

  const result = {
    ...extracted,
    mode: activeMode,
    trigger,
    wordCount: session.countWords(extracted.markdown),
    copied: await writeClipboard(extracted.markdown, { tabId, frameId: extracted.frameId })
  };

  if (collect ?? prefs.collectMode) {
    Object.assign(result, await appendToSession(result, activeMode).catch(() => ({ saveFailed: true })));
  }

  await chrome.storage.session.set({ [LAST_RESULT_KEY]: result }).catch(() => {});
  return { ...result, ...describe(result) };
}

function describe(result) {
  const words = t("words", [String(result.wordCount)]);
  if (!result.copied) return { tone: "warning", message: t("toastCopyFailed") };
  if (result.saveFailed) return { tone: "warning", message: t("toastSaveFailed") };
  if (result.duplicate) return { tone: "success", message: t("toastDuplicate") };
  if (result.added) {
    const message = t("toastCopiedAndSaved", [words, String(result.count)]);
    return result.nearQuota ? { tone: "warning", message: `${message} ${t("toastNearQuota")}` } : { tone: "success", message };
  }
  return { tone: "success", message: t("toastCopied", [words]) };
}

function failure(error, detail) {
  const key = { "no-selection": "errorNoSelection", empty: "errorEmpty", restricted: "errorRestricted", "file-access": "errorFileAccess" }[error] ?? "errorGeneric";
  return { ok: false, error, detail, tone: "error", message: t(key) };
}

async function extractFromTab(tabId, frameId, mode) {
  try {
    const target = { tabId, frameIds: [frameId ?? (await pickFrame(tabId))] };
    if (target.frameIds[0] == null) return failure("no-selection");
    const result = await runEngine(target, mode);
    return result?.ok ? { ...result, frameId: target.frameIds[0] } : failure(result?.error ?? "empty", result?.detail);
  } catch (error) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab?.url?.startsWith("file:") && !(await chrome.extension.isAllowedFileSchemeAccess())) return failure("file-access");
    return failure("restricted", String(error?.message ?? error));
  }
}

async function pickFrame(tabId) {
  const probes = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: injected.probeSelection });
  const candidates = probes.filter((probe) => probe.result?.size > 0);
  const best = candidates.find((probe) => probe.result.focused) ?? candidates.sort((a, b) => b.result.size - a.result.size)[0];
  return best?.frameId;
}

async function runEngine(target, mode) {
  const [{ result: ready }] = await chrome.scripting.executeScript({
    target,
    func: (version) => globalThis.WMExt?.engineVersion === version && typeof globalThis.WMExt.extractor?.extract === "function",
    args: [VERSION]
  });
  if (!ready) await chrome.scripting.executeScript({ target, files: ENGINE_FILES });
  const [{ result }] = await chrome.scripting.executeScript({
    target,
    func: (options, version) => {
      globalThis.WMExt.engineVersion = version;
      try {
        return globalThis.WMExt.extractor.extract(options);
      } catch (error) {
        return { ok: false, error: "engine", detail: String(error?.message ?? error) };
      }
    },
    args: [{ mode }, VERSION]
  });
  return result;
}

let offscreenCreation = null;

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (contexts.length) return;
  offscreenCreation ??= chrome.offscreen
    .createDocument({ url: "offscreen.html", reasons: ["CLIPBOARD"], justification: "Copy converted Markdown to the clipboard." })
    .finally(() => (offscreenCreation = null));
  await offscreenCreation;
}

async function writeClipboard(text, fallbackTarget) {
  if (!text) return false;
  if (chrome.offscreen) {
    try {
      await ensureOffscreen();
      if ((await chrome.runtime.sendMessage({ target: "offscreen", type: "WM_CLIPBOARD_WRITE", text })) === true) return true;
    } catch {
      /* fall through to in-page copy */
    }
  }
  if (!fallbackTarget) return false;
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: fallbackTarget.tabId, frameIds: [fallbackTarget.frameId ?? 0] },
      func: injected.copyInPage,
      args: [text]
    });
    return result === true;
  } catch {
    return false;
  }
}

let sessionQueue = Promise.resolve();

function mutateSession(change) {
  const run = sessionQueue.then(async () => session.write(change(await session.read())));
  sessionQueue = run.catch(() => {});
  return run;
}

async function appendToSession(result, mode) {
  const entry = session.createEntry(result, mode);
  if (!entry.markdown) return { added: false };
  let duplicate = false;
  const saved = await mutateSession((current) => {
    duplicate = session.isDuplicate(current.entries, entry);
    return duplicate ? current : { entries: [...current.entries, entry] };
  });
  return { added: !duplicate, duplicate, count: saved.entries.length, nearQuota: await session.isNearQuota() };
}

async function refreshBadge(count) {
  const total = count ?? (await session.read()).entries.length;
  await chrome.action.setBadgeText({ text: total ? (total > 99 ? "99+" : String(total)) : "" });
  await chrome.action.setTitle({ title: total ? t("actionTitleWithCount", [String(total)]) : t("extName") });
}

async function flashError(message) {
  await Promise.all([
    chrome.action.setBadgeText({ text: "!" }),
    chrome.action.setBadgeBackgroundColor({ color: ERROR_COLOR }),
    chrome.action.setTitle({ title: message })
  ]).catch(() => {});
  setTimeout(() => {
    chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
    refreshBadge();
  }, ERROR_BADGE_MS);
}

async function injectIntoOpenTabs() {
  const files = chrome.runtime.getManifest().content_scripts[0].js;
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"], discarded: false });
  await Promise.allSettled(tabs.map((tab) => chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files })));
}
