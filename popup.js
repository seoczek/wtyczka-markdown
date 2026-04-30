(function () {
  const STORAGE_KEY = "wm-settings";
  const DEFAULT_SETTINGS = {
    collectMode: false
  };

  const elements = {
    convertBtn: document.getElementById("convertBtn"),
    captureBtn: document.getElementById("captureBtn"),
    copyBtn: document.getElementById("copyBtn"),
    copySessionBtn: document.getElementById("copySessionBtn"),
    clearSessionBtn: document.getElementById("clearSessionBtn"),
    collectMode: document.getElementById("collectMode"),
    shortcutBtn: document.getElementById("shortcutBtn"),
    shortcutLabel: document.getElementById("shortcutLabel"),
    resultViewBtn: document.getElementById("resultViewBtn"),
    sessionViewBtn: document.getElementById("sessionViewBtn"),
    status: document.getElementById("status"),
    meta: document.getElementById("meta"),
    output: document.getElementById("markdownOutput")
  };

  const state = {
    collectMode: false,
    currentView: "result",
    resultMarkdown: "",
    resultMetaLabel: "",
    sessionMarkdown: "",
    sessionStats: {
      fragments: 0,
      words: 0
    },
    lastResult: null,
    lastResultInSession: false,
    busy: false
  };

  function normalizeSettings(settings) {
    const value = settings && typeof settings === "object" ? settings : {};
    return {
      collectMode:
        typeof value.collectMode === "boolean" ? value.collectMode : DEFAULT_SETTINGS.collectMode
    };
  }

  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(STORAGE_KEY, (result) => {
        if (chrome.runtime.lastError) {
          resolve({ ...DEFAULT_SETTINGS });
          return;
        }

        resolve(normalizeSettings(result[STORAGE_KEY]));
      });
    });
  }

  function saveSettings() {
    const payload = normalizeSettings({
      collectMode: state.collectMode
    });

    return new Promise((resolve, reject) => {
      chrome.storage.sync.set({ [STORAGE_KEY]: payload }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || "Nie udało się zapisać ustawień."));
          return;
        }

        resolve(payload);
      });
    });
  }

  function setStatus(message, kind) {
    elements.status.textContent = message;
    elements.status.classList.remove("is-warning", "is-error", "is-success");
    if (kind) {
      elements.status.classList.add(`is-${kind}`);
    }
  }

  function getSessionStats() {
    return state.sessionStats || { fragments: 0, words: 0 };
  }

  function getActiveViewMarkdown() {
    return state.currentView === "session" ? state.sessionMarkdown : state.resultMarkdown;
  }

  function getResultMeta() {
    if (!state.resultMarkdown.trim()) {
      return "Brak wyniku";
    }

    const words = state.lastResult?.wordCount || state.resultMarkdown.trim().split(/\s+/).length;
    const label = state.resultMetaLabel || "Zaznaczenie";
    return `${label} • ${words} słów`;
  }

  function getSessionMeta() {
    const stats = getSessionStats();
    if (!state.sessionMarkdown.trim() || !stats.fragments) {
      return "Sesja jest pusta";
    }

    return `${stats.fragments} fragmentów • ${stats.words} słów`;
  }

  function syncPreview() {
    const value = getActiveViewMarkdown();
    elements.output.value = value;
    elements.meta.textContent = state.currentView === "session" ? getSessionMeta() : getResultMeta();
    elements.resultViewBtn.classList.toggle("active", state.currentView === "result");
    elements.sessionViewBtn.classList.toggle("active", state.currentView === "session");

    const hasViewMarkdown = Boolean(value.trim());
    const hasSessionMarkdown = Boolean(state.sessionMarkdown.trim());
    elements.copyBtn.disabled = state.busy || !hasViewMarkdown;
    elements.copyBtn.textContent = "Kopiuj widok";
    elements.copySessionBtn.disabled = state.busy || !hasSessionMarkdown;
    elements.clearSessionBtn.disabled = state.busy || !hasSessionMarkdown;
    elements.captureBtn.disabled = state.busy || !state.resultMarkdown.trim() || state.lastResultInSession;
    elements.captureBtn.textContent = state.lastResultInSession ? "Wynik już jest w sesji" : "Dodaj wynik do sesji";
  }

  function setBusy(isBusy) {
    state.busy = isBusy;
    elements.convertBtn.disabled = isBusy;
    elements.captureBtn.disabled = isBusy || !state.resultMarkdown.trim() || state.lastResultInSession;
    elements.copyBtn.disabled = isBusy || !getActiveViewMarkdown().trim();
    elements.copySessionBtn.disabled = isBusy || !state.sessionMarkdown.trim();
    elements.clearSessionBtn.disabled = isBusy || !state.sessionMarkdown.trim();
    elements.collectMode.disabled = isBusy;
    elements.shortcutBtn.disabled = isBusy;
    elements.resultViewBtn.disabled = isBusy;
    elements.sessionViewBtn.disabled = isBusy;
    elements.convertBtn.textContent = isBusy ? "Konwertuję..." : "Konwertuj zaznaczenie";
  }

  function syncToggleUI() {
    elements.collectMode.checked = state.collectMode;
  }

  function normalizeShortcut(shortcut) {
    return shortcut && typeof shortcut === "string" ? shortcut.replace(/\s*\+\s*/g, " + ") : "";
  }

  function loadShortcutLabel() {
    if (!chrome.commands?.getAll) {
      elements.shortcutLabel.textContent = "Skrót Chrome";
      return;
    }

    chrome.commands.getAll((commands) => {
      if (chrome.runtime.lastError) {
        elements.shortcutLabel.textContent = "Skrót Chrome";
        return;
      }

      const command = (commands || []).find((item) => item.name === "convert-selection");
      elements.shortcutLabel.textContent = normalizeShortcut(command?.shortcut) || "Nie ustawiono skrótu";
    });
  }

  function openShortcutSettings() {
    const shortcutsUrl = "chrome://extensions/shortcuts";

    try {
      chrome.tabs.create({ url: shortcutsUrl }, () => {
        if (chrome.runtime.lastError) {
          window.open(shortcutsUrl, "_blank", "noopener");
        }
      });
      setStatus("Otwieram ustawienia skrótów Chrome.", "success");
    } catch (error) {
      window.open(shortcutsUrl, "_blank", "noopener");
      setStatus("Otwieram ustawienia skrótów Chrome.", "success");
    }
  }

  function setResult(result) {
    state.lastResult = result || null;
    state.lastResultInSession = Boolean(result?.appendedToSession);
    state.resultMarkdown = result?.markdown || "";
    state.resultMetaLabel = result?.title || "Zaznaczenie";
    syncPreview();
  }

  async function loadSession() {
    const session = await window.WMExt.session.readSession(window);
    state.sessionMarkdown = window.WMExt.session.exportSessionMarkdown(session);
    state.sessionStats = window.WMExt.session.getSessionStats(session);
    syncPreview();
  }

  function withActiveTab() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        const tab = tabs && tabs[0];
        if (!tab || typeof tab.id !== "number") {
          reject(new Error("Nie udało się znaleźć aktywnej karty."));
          return;
        }

        resolve(tab);
      });
    });
  }

  function sendMessageToTab(tabId, message) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(getUserFriendlyRuntimeError(chrome.runtime.lastError.message)));
          return;
        }

        resolve(response);
      });
    });
  }

  function getUserFriendlyRuntimeError(message) {
    const value = String(message || "");
    if (
      value.includes("Could not establish connection") ||
      value.includes("Receiving end does not exist") ||
      value.includes("Cannot access")
    ) {
      return "Nie mogę uruchomić konwersji na tej karcie. Chrome blokuje rozszerzenia na stronach systemowych, Chrome Web Store i części specjalnych widoków.";
    }

    return value || "Nie udało się połączyć z bieżącą kartą.";
  }

  async function copyToClipboard(text) {
    if (!text || !text.trim()) {
      return false;
    }

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.top = "0";
      textarea.style.left = "-9999px";
      textarea.style.width = "1px";
      textarea.style.height = "1px";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      const copied = document.execCommand("copy");
      textarea.remove();
      return copied;
    }
  }

  function buildConvertOptions() {
    return {
      mode: "smart",
      autoCopy: true,
      collectMode: state.collectMode,
      trigger: "popup"
    };
  }

  async function refreshSessionFromResult(result) {
    if (result?.sessionMarkdown) {
      state.sessionMarkdown = result.sessionMarkdown;
      state.sessionStats = result.sessionStats || state.sessionStats;
      syncPreview();
      return;
    }

    await loadSession();
  }

  async function handleConvert() {
    if (state.busy) {
      return;
    }

    setBusy(true);
    setStatus("Pobieram zaznaczenie z bieżącej karty...");

    try {
      const tab = await withActiveTab();
      const result = await sendMessageToTab(tab.id, {
        type: "WM_EXTRACT_SELECTION",
        options: buildConvertOptions()
      });

      if (!result?.ok) {
        throw new Error(result?.error || "Nie udało się odczytać zaznaczenia.");
      }

      setResult(result);
      await refreshSessionFromResult(result);

      if (result.copied && result.appendedToSession) {
        setStatus(
          `Markdown skopiowany i dopisany do sesji (${result.sessionStats?.fragments || 0} fragmentów).`,
          "success"
        );
      } else if (result.copied) {
        setStatus("Markdown wygenerowany i skopiowany do schowka.", "success");
      } else if (result.appendedToSession) {
        setStatus(
          `Markdown dopisany do sesji (${result.sessionStats?.fragments || 0} fragmentów), ale kopiowanie się nie powiodło.`,
          "warning"
        );
      } else {
        setStatus("Markdown wygenerowany, ale kopiowanie do schowka się nie powiodło.", "warning");
      }
    } catch (error) {
      const message = error?.message || "Nieznany błąd konwersji.";
      setResult(null);
      setStatus(message, "error");
    } finally {
      setBusy(false);
      syncPreview();
    }
  }

  async function handleAddCurrentToSession() {
    if (!state.resultMarkdown.trim() || !state.lastResult?.ok) {
      setStatus("Najpierw wygeneruj Markdown dla zaznaczenia.", "warning");
      return;
    }

    setBusy(true);
    setStatus("Dopisuję wynik do sesji...");

    try {
      const appended = await window.WMExt.session.appendResult(state.lastResult, {
        mode: "smart",
        trigger: "popup-manual"
      });

      state.sessionMarkdown = appended.markdown;
      state.sessionStats = appended.stats;
      state.lastResultInSession = true;
      state.currentView = "session";
      syncPreview();
      setStatus(`Wynik dopisany do sesji (${appended.stats.fragments} fragmentów).`, "success");
    } catch (error) {
      setStatus(error?.message || "Nie udało się dopisać wyniku do sesji.", "error");
    } finally {
      setBusy(false);
      syncPreview();
    }
  }

  async function handleCopyActiveView() {
    const text = getActiveViewMarkdown();
    if (!text.trim()) {
      setStatus(state.currentView === "session" ? "Sesja jest pusta." : "Brak Markdown do skopiowania.", "warning");
      return;
    }

    const copied = await copyToClipboard(text);
    setStatus(
      copied
        ? state.currentView === "session"
          ? "Sesja skopiowana do schowka."
          : "Markdown skopiowany do schowka."
        : "Nie udało się skopiować wyniku.",
      copied ? "success" : "error"
    );
  }

  async function handleCopySession() {
    if (!state.sessionMarkdown.trim()) {
      setStatus("Sesja jest pusta.", "warning");
      return;
    }

    const copied = await copyToClipboard(state.sessionMarkdown);
    setStatus(copied ? "Sesja skopiowana do schowka." : "Nie udało się skopiować sesji.", copied ? "success" : "error");
  }

  async function handleClearSession() {
    if (!state.sessionMarkdown.trim()) {
      setStatus("Sesja jest już pusta.", "warning");
      return;
    }

    setBusy(true);
    setStatus("Czyszczę sesję...");

    try {
      await window.WMExt.session.clearSession(window);
      state.sessionMarkdown = "";
      state.sessionStats = { fragments: 0, words: 0 };
      state.lastResultInSession = false;
      if (state.currentView === "session") {
        state.currentView = "result";
      }
      syncPreview();
      setStatus("Sesja została wyczyszczona.", "success");
    } catch (error) {
      setStatus(error?.message || "Nie udało się wyczyścić sesji.", "error");
    } finally {
      setBusy(false);
      syncPreview();
    }
  }

  async function setCollectMode(value) {
    const previousValue = state.collectMode;
    state.collectMode = Boolean(value);
    syncToggleUI();
    try {
      await saveSettings();
      setStatus(
        state.collectMode ? "Tryb zbierania do sesji włączony." : "Tryb zbierania do sesji wyłączony.",
        "success"
      );
    } catch (error) {
      state.collectMode = previousValue;
      syncToggleUI();
      setStatus(error?.message || "Nie udało się zapisać ustawienia.", "error");
    }
  }

  function setView(view) {
    state.currentView = view === "session" ? "session" : "result";
    syncPreview();
  }

  async function init() {
    const settings = await loadSettings();
    state.collectMode = settings.collectMode;
    syncToggleUI();
    setResult(null);
    await loadSession();

    elements.convertBtn.addEventListener("click", handleConvert);
    elements.captureBtn.addEventListener("click", handleAddCurrentToSession);
    elements.copyBtn.addEventListener("click", handleCopyActiveView);
    elements.copySessionBtn.addEventListener("click", handleCopySession);
    elements.clearSessionBtn.addEventListener("click", handleClearSession);
    elements.shortcutBtn.addEventListener("click", openShortcutSettings);
    elements.collectMode.addEventListener("change", () => setCollectMode(elements.collectMode.checked));
    elements.resultViewBtn.addEventListener("click", () => setView("result"));
    elements.sessionViewBtn.addEventListener("click", () => setView("session"));

    window.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "enter") {
        event.preventDefault();
        handleConvert();
      }
    });

    setStatus("Gotowe. Zaznacz tekst na stronie i kliknij konwersję.", "success");
    loadShortcutLabel();
    syncPreview();
  }

  init().catch((error) => {
    setStatus(error?.message || "Nie udało się uruchomić popupu.", "error");
  });
})();
