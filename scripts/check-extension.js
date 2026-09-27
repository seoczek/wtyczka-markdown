import { existsSync, readFileSync } from "node:fs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const manifest = readJson("manifest.json");
const pkg = readJson("package.json");
const errors = [];
const check = (condition, message) => condition || errors.push(message);

check(manifest.manifest_version === 3, "manifest_version must be 3");
check(manifest.version === pkg.version, `manifest version ${manifest.version} differs from package.json ${pkg.version}`);

const scriptRefs = (file) =>
  [...readFileSync(file, "utf8").matchAll(/importScripts\(([^)]*)\)|<script src="([^"]+)"/g)].flatMap(([, list, src]) =>
    src ? [src] : [...list.matchAll(/"([^"]+)"/g)].map((match) => match[1])
  );

const referenced = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {}),
  ...(manifest.content_scripts ?? []).flatMap((script) => script.js ?? []),
  ...[...readFileSync("background.js", "utf8").matchAll(/"((?:src\/)?[\w-]+\.(?:js|html))"/g)].map((match) => match[1]),
  ...["background.js", "popup.html", "offscreen.html"].flatMap(scriptRefs)
];
for (const file of new Set(referenced)) check(file && existsSync(file), `missing file referenced by the extension: ${file}`);

const locales = Object.fromEntries(["en", "pl"].map((locale) => [locale, readJson(`_locales/${locale}/messages.json`)]));
const baseKeys = Object.keys(locales[manifest.default_locale] ?? {});
check(baseKeys.length, `default_locale "${manifest.default_locale}" has no messages`);
for (const [locale, messages] of Object.entries(locales)) {
  check(Object.keys(messages).sort().join() === [...baseKeys].sort().join(), `_locales/${locale} keys differ from default locale`);
}

const sources = ["manifest.json", "background.js", "popup.html", "popup.js", "src/content-script.js"].map((file) => readFileSync(file, "utf8")).join("\n");
const usedKeys = new Set(
  [/__MSG_(\w+)__/g, /\bt\("(\w+)"/g, /data-i18n(?:-[\w-]+)?="(\w+)"/g, /value="(aiPreset\w+)"/g, /"(error\w+|mode\w+Hint)"/g].flatMap((pattern) =>
    [...sources.matchAll(pattern)].map((match) => match[1])
  )
);
for (const key of usedKeys) check(baseKeys.includes(key), `i18n key "${key}" is used but not defined`);

for (const script of manifest.content_scripts ?? []) {
  check(script.all_frames && script.match_origin_as_fallback, "content scripts must run in all frames, including about:blank/srcdoc editors");
}

const permissions = new Set(manifest.permissions);
check(!permissions.has("activeTab"), "activeTab is redundant with <all_urls> host permissions");
for (const permission of ["scripting", "offscreen", "storage", "contextMenus"]) check(permissions.has(permission), `missing permission: ${permission}`);

if (errors.length) {
  console.error(errors.map((error) => `✗ ${error}`).join("\n"));
  process.exit(1);
}
console.log(`Manifest, referenced files and ${usedKeys.size} i18n keys are consistent.`);
