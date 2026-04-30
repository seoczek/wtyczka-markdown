import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const requiredPermissions = new Set(["activeTab", "contextMenus", "storage", "clipboardWrite"]);

for (const permission of requiredPermissions) {
  if (!manifest.permissions?.includes(permission)) {
    throw new Error(`Brakuje wymaganego uprawnienia: ${permission}.`);
  }
}

if (manifest.background?.service_worker !== "background.js") {
  throw new Error("Manifest MV3 powinien wskazywac background.js jako service worker.");
}

if (!manifest.icons?.["128"] || !manifest.action?.default_icon?.["128"]) {
  throw new Error("Manifest powinien wskazywac ikony rozszerzenia i ikone akcji.");
}

if (!manifest.content_scripts?.[0]?.js?.includes("src/content-script.js")) {
  throw new Error("Manifest musi ladowac src/content-script.js jako content script.");
}

const markdownSource = readFileSync("src/markdown.js", "utf8");
if (!markdownSource.includes("ALLOWED_LINK_PROTOCOLS")) {
  throw new Error("src/markdown.js musi filtrowac protokoly linkow allowlista.");
}

if (markdownSource.includes('value.protocol === "javascript:"')) {
  throw new Error("Filtrowanie tylko javascript: jest za waskie.");
}

if (markdownSource.includes("![${escapeMarkdownLinkText(alt)}]()")) {
  throw new Error("Nie generuj pustych linkow obrazow w Markdown.");
}

console.log("Podstawowy lint runtime przeszedl.");
