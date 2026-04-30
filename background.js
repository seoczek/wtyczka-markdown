const MENU_ID = "wm-convert-selection";
const DEFAULT_SETTINGS = {
  collectMode: false
};

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get("wm-settings", (result) => {
      if (chrome.runtime.lastError) {
        resolve({ ...DEFAULT_SETTINGS });
        return;
      }

      resolve({
        ...DEFAULT_SETTINGS,
        ...(result["wm-settings"] || {})
      });
    });
  });
}

function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "Konwertuj zaznaczenie do Markdown",
      contexts: ["selection"]
    });
  });
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  return tabs[0];
}

async function sendQuickConvert(tabId, trigger) {
  if (!tabId) {
    return;
  }

  const settings = await getSettings();

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "WM_RUN_QUICK_CONVERT",
      options: {
        mode: "smart",
        autoCopy: true,
        collectMode: settings.collectMode,
        trigger
      }
    });
  } catch (error) {
    console.warn("Wtyczka Markdown: nie udalo sie uruchomic konwersji.", error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  createContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  createContextMenu();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) {
    return;
  }

  await sendQuickConvert(tab.id, "context-menu");
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "convert-selection") {
    return;
  }

  const tab = await getActiveTab();
  if (!tab?.id) {
    return;
  }

  await sendQuickConvert(tab.id, "command");
});
