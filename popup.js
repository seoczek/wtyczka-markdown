const { settings, session } = globalThis.WMExt;
const t = (key, substitutions) => chrome.i18n.getMessage(key, substitutions);
const $ = (id) => document.getElementById(id);
const LAST_RESULT_KEY = "wm-last-result";
const TAB_KEY = "wm-popup-tab";
const TABS = ["result", "session", "settings"];
const UNDO_MS = 8000;
const number = new Intl.NumberFormat(chrome.i18n.getUILanguage());

const state = { prefs: settings.normalize(), entries: [], result: null, hostname: "", undo: null };

function localize() {
  document.documentElement.lang = chrome.i18n.getUILanguage();
  for (const element of document.querySelectorAll("[data-i18n]")) element.textContent = t(element.dataset.i18n);
  for (const attribute of ["placeholder", "title", "aria-label"]) {
    for (const element of document.querySelectorAll(`[data-i18n-${attribute}]`)) {
      element.setAttribute(attribute, t(element.getAttribute(`data-i18n-${attribute}`)));
    }
  }
}

function setStatus(message, tone = "info") {
  $("status").textContent = message ?? "";
  $("status").dataset.tone = tone;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return (await chrome.runtime.sendMessage({ type: "WM_COPY", text }).catch(() => null))?.ok === true;
  }
}

async function copyWithStatus(text, successMessage) {
  const copied = await copyText(text);
  setStatus(copied ? successMessage : t("toastCopyFailedPopup"), copied ? "success" : "error");
}

const send = (message) => chrome.runtime.sendMessage(message).catch(() => ({ ok: false, message: t("errorGeneric"), tone: "error" }));

function selectTab(name, focus = false) {
  for (const tab of document.querySelectorAll('[role="tab"]')) {
    const selected = tab.id === `tab-${name}`;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    $(tab.getAttribute("aria-controls")).hidden = !selected;
    if (selected && focus) tab.focus();
  }
  localStorage.setItem(TAB_KEY, name);
}

function onTabKeydown(event) {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const index = tabs.indexOf(event.currentTarget);
  const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  selectTab(tabs.at(next % tabs.length).id.slice(4), true);
}

function renderPrefs() {
  const { prefs, hostname } = state;
  for (const radio of document.querySelectorAll('input[name="mode"]')) radio.checked = radio.value === prefs.mode;
  $("modeHint").textContent = t(prefs.mode === "strict" ? "modeStrictHint" : "modeSmartHint");
  $("collectMode").checked = prefs.collectMode;
  $("showButton").checked = prefs.showButton;
  if (document.activeElement !== $("aiInstruction")) $("aiInstruction").value = prefs.aiInstruction;
  $("siteToggle").hidden = !hostname;
  $("excludeSite").checked = settings.isExcluded(hostname, prefs.excludedDomains);
  $("excludeSite").disabled = !prefs.showButton;
  $("excludeSiteLabel").textContent = t("excludeSiteLabel", [hostname.replace(/^www\./, "")]);
  $("excludedList").replaceChildren(
    ...(prefs.excludedDomains.length
      ? prefs.excludedDomains.map((domain) => chip(domain))
      : [Object.assign(document.createElement("li"), { className: "hint", textContent: t("excludedEmpty") })])
  );
}

function chip(domain) {
  const item = document.createElement("li");
  const remove = Object.assign(document.createElement("button"), { type: "button", textContent: "×", title: t("remove") });
  remove.setAttribute("aria-label", t("removeDomain", [domain]));
  remove.addEventListener("click", () => savePrefs({ excludedDomains: state.prefs.excludedDomains.filter((value) => value !== domain) }));
  item.append(domain, remove);
  return item;
}

async function savePrefs(patch) {
  try {
    state.prefs = await settings.update(patch);
  } catch {
    setStatus(t("errorSettings"), "error");
  }
  renderPrefs();
}

function renderResult() {
  const { result } = state;
  const hasResult = Boolean(result?.markdown);
  $("onboarding").hidden = hasResult;
  $("output").hidden = !hasResult;
  $("resultTools").hidden = !hasResult;
  if (!hasResult) return;
  $("output").value = result.markdown;
  const tables = result.tables ?? [];
  $("copyTable").hidden = !tables.length;
  $("copyTable").textContent = tables.length > 1 ? t("copyTables", [String(tables.length)]) : t("copyTable");
  $("copyTable").title = t("copyTableHint");
  updateResultMeta();
}

function updateResultMeta() {
  const words = session.countWords($("output").value);
  const source = session.getDomain(state.result?.url);
  $("resultMeta").textContent = [t("words", [number.format(words)]), source].filter(Boolean).join(" · ");
}

function renderSession() {
  const { entries } = state;
  $("sessionCount").hidden = !entries.length;
  $("sessionCount").textContent = number.format(entries.length);
  $("sessionEmpty").hidden = Boolean(entries.length);
  $("sessionContent").hidden = !entries.length;
  $("entries").replaceChildren(...entries.map(entryItem));
  renderSessionMeta();
}

function renderSessionMeta() {
  const { entries } = state;
  const words = entries.reduce((sum, entry) => sum + entry.wordCount, 0);
  const tokens = session.estimateTokens(session.toAiPrompt(entries, $("aiInstruction").value));
  $("sessionMeta").textContent = [
    t("fragments", [number.format(entries.length)]),
    t("words", [number.format(words)]),
    t("tokens", [number.format(tokens)])
  ].join(" · ");
}

function entryItem(entry) {
  const item = document.createElement("li");
  const open = Object.assign(document.createElement("button"), { type: "button", className: "entry", title: [t("openEntry"), entry.url].filter(Boolean).join("\n") });
  const title = Object.assign(document.createElement("span"), { className: "entry-title", textContent: [entry.title || entry.domain, entry.section].filter(Boolean).join(" › ") });
  const time = entry.capturedAt ? new Date(entry.capturedAt).toLocaleTimeString(chrome.i18n.getUILanguage(), { hour: "2-digit", minute: "2-digit" }) : "";
  const meta = Object.assign(document.createElement("span"), {
    className: "meta",
    textContent: [entry.domain, t("words", [number.format(entry.wordCount)]), time].filter(Boolean).join(" · ")
  });
  open.append(title, meta);
  open.addEventListener("click", () => {
    state.result = { markdown: entry.markdown, url: entry.url, tables: [] };
    renderResult();
    selectTab("result");
  });
  const remove = Object.assign(document.createElement("button"), { type: "button", className: "icon", textContent: "×" });
  remove.setAttribute("aria-label", t("removeEntry", [title.textContent]));
  remove.title = t("remove");
  remove.addEventListener("click", () => mutateWithUndo({ type: "WM_SESSION_REMOVE", id: entry.id }, t("entryRemoved")));
  item.append(open, remove);
  return item;
}

async function mutateWithUndo(message, text) {
  const previous = state.entries;
  const response = await send(message);
  if (!response?.ok) return setStatus(t("errorGeneric"), "error");
  clearTimeout(state.undo);
  $("snackbarText").textContent = text;
  $("snackbar").hidden = false;
  $("undo").onclick = async () => {
    await send({ type: "WM_SESSION_RESTORE", entries: previous });
    $("snackbar").hidden = true;
  };
  state.undo = setTimeout(() => ($("snackbar").hidden = true), UNDO_MS);
}

async function convert() {
  const button = $("convert");
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  setStatus(t("converting"));
  const response = await send({ type: "WM_CONVERT", mode: state.prefs.mode });
  button.disabled = false;
  button.removeAttribute("aria-busy");
  setStatus(response?.message, response?.tone);
  if (!response?.ok) return;
  state.result = response;
  renderResult();
  selectTab("result");
}

function download() {
  const text = session.toMarkdown(state.entries);
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
  Object.assign(document.createElement("a"), { href: url, download: `markdown-session-${stamp}.md` }).click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function bindEvents() {
  $("convert").addEventListener("click", convert);
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !$("convert").disabled) convert();
  });
  for (const radio of document.querySelectorAll('input[name="mode"]')) {
    radio.addEventListener("change", () => savePrefs({ mode: radio.value }));
  }
  $("collectMode").addEventListener("change", (event) => savePrefs({ collectMode: event.target.checked }));
  $("showButton").addEventListener("change", (event) => savePrefs({ showButton: event.target.checked }));
  $("excludeSite").addEventListener("change", (event) => {
    const domain = settings.normalizeDomain(state.hostname);
    const others = state.prefs.excludedDomains.filter((value) => !settings.isExcluded(state.hostname, [value]));
    savePrefs({ excludedDomains: event.target.checked ? [...others, domain] : others });
  });
  $("excludeForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const domain = settings.normalizeDomain($("excludeInput").value);
    if (!domain) return setStatus(t("errorDomain"), "error");
    $("excludeInput").value = "";
    savePrefs({ excludedDomains: [...state.prefs.excludedDomains, domain] });
  });
  $("editShortcut").addEventListener("click", () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" }));

  for (const tab of document.querySelectorAll('[role="tab"]')) {
    tab.addEventListener("click", () => selectTab(tab.id.slice(4)));
    tab.addEventListener("keydown", onTabKeydown);
  }

  $("output").addEventListener("input", updateResultMeta);
  $("copyResult").addEventListener("click", () => copyWithStatus($("output").value, t("copied")));
  $("copyTable").addEventListener("click", () => copyWithStatus(state.result.tables.join("\n\n"), t("tableCopied")));
  $("addToSession").addEventListener("click", async () => {
    const response = await send({ type: "WM_SESSION_ADD", result: { ...state.result, markdown: $("output").value } });
    if (response?.added) setStatus(t("addedToSession"), "success");
    else if (response?.duplicate) setStatus(t("alreadyInSession"));
    else setStatus(t("errorGeneric"), "error");
  });

  $("copyAi").addEventListener("click", () => copyWithStatus(session.toAiPrompt(state.entries, $("aiInstruction").value), t("copiedForAi")));
  $("copyMarkdown").addEventListener("click", () => copyWithStatus(session.toMarkdown(state.entries), t("copied")));
  $("download").addEventListener("click", download);
  $("clearSession").addEventListener("click", () => mutateWithUndo({ type: "WM_SESSION_CLEAR" }, t("sessionCleared")));

  $("preset").addEventListener("change", (event) => {
    if (!event.target.value) return;
    $("aiInstruction").value = t(event.target.value);
    event.target.value = "";
    savePrefs({ aiInstruction: $("aiInstruction").value });
    renderSessionMeta();
  });
  let instructionTimer = 0;
  $("aiInstruction").addEventListener("input", () => {
    renderSessionMeta();
    clearTimeout(instructionTimer);
    instructionTimer = setTimeout(() => savePrefs({ aiInstruction: $("aiInstruction").value }), 400);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[session.SESSION_KEY]) {
      state.entries = session.normalize(changes[session.SESSION_KEY].newValue).entries;
      renderSession();
    }
  });
}

async function renderShortcut() {
  const command = (await chrome.commands.getAll()).find((item) => item.name === "convert-selection");
  const shortcut = command?.shortcut ?? "";
  $("shortcut").hidden = !shortcut;
  $("shortcut").textContent = shortcut;
  $("shortcut").title = t("shortcutHint");
  $("shortcutValue").textContent = shortcut || t("shortcutMissing");
}

async function init() {
  localize();
  bindEvents();
  const [prefs, stored, last, [tab]] = await Promise.all([
    settings.load(),
    session.read(),
    chrome.storage.session.get(LAST_RESULT_KEY).catch(() => ({})),
    chrome.tabs.query({ active: true, lastFocusedWindow: true })
  ]);
  state.prefs = prefs;
  state.entries = stored.entries;
  state.result = last[LAST_RESULT_KEY] ?? null;
  state.hostname = /^https?:/.test(tab?.url ?? "") ? new URL(tab.url).hostname : "";
  renderPrefs();
  renderResult();
  renderSession();
  renderShortcut();
  const savedTab = localStorage.getItem(TAB_KEY);
  selectTab(TABS.includes(savedTab) ? savedTab : "result");
  setStatus(state.result ? t("statusLastResult") : t("statusReady"));
  $("convert").focus();
}

init();
