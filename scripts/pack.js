import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const { version } = JSON.parse(readFileSync("manifest.json", "utf8"));
const output = `dist/wtyczka-markdown-${version}.zip`;
const files = ["manifest.json", "background.js", "offscreen.html", "offscreen.js", "popup.html", "popup.css", "popup.js", "src", "_locales", "assets/icons", "LICENSE"];

mkdirSync("dist", { recursive: true });
rmSync(output, { force: true });
const { status } = spawnSync("zip", ["-r", "-X", "-q", output, ...files], { stdio: "inherit" });
if (status !== 0) process.exit(status ?? 1);
console.log(`Packed ${output}`);
