import { readFileSync } from "node:fs";
import vm from "node:vm";
import { vi } from "vitest";

export const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));

export function createEvent() {
  const listeners = new Set();
  return {
    listeners,
    addListener: (listener) => listeners.add(listener),
    removeListener: (listener) => listeners.delete(listener),
    dispatch: (...args) => [...listeners].map((listener) => listener(...args))
  };
}

function createArea(name, data, onChanged, { failWrites = false } = {}) {
  return {
    data,
    async get(keys) {
      const list = keys == null ? Object.keys(data) : [keys].flat();
      return Object.fromEntries(list.filter((key) => key in data).map((key) => [key, structuredClone(data[key])]));
    },
    async set(items) {
      if (failWrites) throw new Error("QUOTA_BYTES quota exceeded");
      const changes = {};
      for (const [key, value] of Object.entries(items)) {
        changes[key] = { oldValue: data[key], newValue: structuredClone(value) };
        data[key] = structuredClone(value);
      }
      onChanged.dispatch(changes, name);
    },
    async getBytesInUse(key) {
      return JSON.stringify(data[key] ?? "").length;
    }
  };
}

export function createChrome({ sync = {}, local = {}, session = {}, failLocalWrites = false } = {}) {
  const onChanged = createEvent();
  return {
    runtime: {
      id: "test-extension",
      getManifest: () => manifest,
      onMessage: createEvent(),
      onInstalled: createEvent(),
      onStartup: createEvent(),
      sendMessage: vi.fn(async () => undefined),
      getContexts: vi.fn(async () => [])
    },
    storage: {
      onChanged,
      sync: createArea("sync", sync, onChanged),
      local: createArea("local", local, onChanged, { failWrites: failLocalWrites }),
      session: createArea("session", session, onChanged)
    },
    i18n: {
      getMessage: (key, substitutions) => (substitutions ? `${key}(${[substitutions].flat().join("|")})` : key),
      getUILanguage: () => "pl"
    },
    action: {
      setBadgeText: vi.fn(async () => {}),
      setBadgeBackgroundColor: vi.fn(async () => {}),
      setBadgeTextColor: vi.fn(async () => {}),
      setTitle: vi.fn(async () => {})
    },
    contextMenus: {
      removeAll: vi.fn((callback) => callback?.()),
      create: vi.fn((_options, callback) => callback?.()),
      onClicked: createEvent()
    },
    commands: { onCommand: createEvent(), getAll: vi.fn(async () => []) },
    tabs: {
      query: vi.fn(async () => [{ id: 7, url: "https://example.com/article" }]),
      get: vi.fn(async (id) => ({ id, url: "https://example.com/article" })),
      sendMessage: vi.fn(async () => undefined),
      create: vi.fn(async () => {})
    },
    scripting: { executeScript: vi.fn(async () => []) },
    offscreen: { createDocument: vi.fn(async () => {}) },
    extension: { isAllowedFileSchemeAccess: vi.fn(async () => false) }
  };
}

export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

export function loadInContext(files, globals) {
  const context = vm.createContext({ console, crypto, URL, Intl, structuredClone, setTimeout, clearTimeout, ...globals });
  context.importScripts = (...paths) => paths.forEach((path) => vm.runInContext(readFileSync(path, "utf8"), context, { filename: path }));
  context.importScripts(...files);
  return context;
}
