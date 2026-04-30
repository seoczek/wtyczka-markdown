(function (global) {
  const WMExt = (global.WMExt = global.WMExt || {});
  const STORAGE_KEY = "wm-settings";
  const DEFAULT_SETTINGS = {
    collectMode: false
  };

  function normalizeSettings(input) {
    const settings = input && typeof input === "object" ? input : {};

    return {
      collectMode:
        typeof settings.collectMode === "boolean" ? settings.collectMode : DEFAULT_SETTINGS.collectMode
    };
  }

  function loadSettings() {
    return new Promise((resolve) => {
      if (!global.chrome?.storage?.sync) {
        resolve({ ...DEFAULT_SETTINGS });
        return;
      }

      global.chrome.storage.sync.get(STORAGE_KEY, (result) => {
        if (global.chrome.runtime?.lastError) {
          resolve({ ...DEFAULT_SETTINGS });
          return;
        }

        resolve(normalizeSettings(result[STORAGE_KEY]));
      });
    });
  }

  function saveSettings(settings) {
    const normalized = normalizeSettings(settings);

    return new Promise((resolve, reject) => {
      if (!global.chrome?.storage?.sync) {
        resolve(normalized);
        return;
      }

      global.chrome.storage.sync.set({ [STORAGE_KEY]: normalized }, () => {
        if (global.chrome.runtime?.lastError) {
          reject(new Error(global.chrome.runtime.lastError.message || "Nie udało się zapisać ustawień."));
          return;
        }

        resolve(normalized);
      });
    });
  }

  async function updateSettings(patch) {
    const current = await loadSettings();
    return saveSettings({ ...current, ...patch });
  }

  WMExt.settings = {
    STORAGE_KEY,
    DEFAULT_SETTINGS,
    normalizeSettings,
    loadSettings,
    saveSettings,
    updateSettings
  };
})(window);
