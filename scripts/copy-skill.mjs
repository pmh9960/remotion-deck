// Copies the Claude Code skill into dist/ so it ships inside the npm package
// (package.json "files" includes "dist"). `remotion-deck skill` installs it from there.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(repo, ".claude", "skills", "remotion-deck");
const dest = path.join(repo, "dist", "skill", "remotion-deck");

if (!fs.existsSync(src)) {
  console.error("copy-skill: source skill not found at", src);
  process.exit(1);
}
fs.mkdirSync(dest, { recursive: true });
let n = 0;
for (const file of fs.readdirSync(src)) {
  fs.copyFileSync(path.join(src, file), path.join(dest, file));
  n += 1;
}
console.log(`✓ copied skill (${n} file${n === 1 ? "" : "s"}) → dist/skill/remotion-deck`);
