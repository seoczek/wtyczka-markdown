import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));

if (manifest.manifest_version !== 3) {
  throw new Error("manifest.json musi uzywac manifest_version: 3.");
}

const jsFiles = [
  "background.js",
  "popup.js",
  "src/settings.js",
  "src/session.js",
  "src/cleaner.js",
  "src/markdown.js",
  "src/extractor.js",
  "src/content-script.js"
];

for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    throw new Error(`Blad skladni w ${file}.`);
  }
}

console.log("Manifest MV3 i skladnia JS sa poprawne.");
