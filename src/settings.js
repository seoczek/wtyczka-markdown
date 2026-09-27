(() => {
  const WMExt = (globalThis.WMExt ??= {});
  const STORAGE_KEY = "wm-settings";
  const MAX_INSTRUCTION_LENGTH = 2000;
  const DEFAULTS = Object.freeze({
    collectMode: false,
    mode: "smart",
    showButton: true,
    excludedDomains: Object.freeze([]),
    aiInstruction: ""
  });

  function normalizeDomain(value) {
    const raw = String(value ?? "").trim().toLowerCase().replace(/^\*\./, "");
    if (!raw) return "";
    try {
      const { hostname } = new URL(raw.includes("://") ? raw : `http://${raw}`);
      return hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  function normalize(input) {
    const value = input && typeof input === "object" ? input : {};
    const domains = Array.isArray(value.excludedDomains) ? value.excludedDomains.map(normalizeDomain) : [];
    return {
      collectMode: typeof value.collectMode === "boolean" ? value.collectMode : DEFAULTS.collectMode,
      mode: value.mode === "strict" ? "strict" : "smart",
      showButton: typeof value.showButton === "boolean" ? value.showButton : DEFAULTS.showButton,
      excludedDomains: [...new Set(domains.filter(Boolean))].sort(),
      aiInstruction: typeof value.aiInstruction === "string" ? value.aiInstruction.slice(0, MAX_INSTRUCTION_LENGTH) : ""
    };
  }

  function isExcluded(hostname, excludedDomains) {
    const host = String(hostname ?? "").toLowerCase().replace(/^www\./, "");
    return Boolean(host) && excludedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  }

  async function load() {
    try {
      const stored = await chrome.storage.sync.get(STORAGE_KEY);
      return normalize(stored[STORAGE_KEY]);
    } catch {
      return normalize();
    }
  }

  async function update(patch) {
    const next = normalize({ ...(await load()), ...patch });
    await chrome.storage.sync.set({ [STORAGE_KEY]: next });
    return next;
  }

  WMExt.settings = { STORAGE_KEY, DEFAULTS, normalize, normalizeDomain, isExcluded, load, update };
})();
