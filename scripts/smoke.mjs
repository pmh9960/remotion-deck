// Smoke test: render the example deck to a PDF using the BUILT library, then assert
// the output is a real multi-page PDF. Run via `npm test` (which builds first).
// This is what CI runs against each Renovate-proposed Remotion bump.
import { renderDeckToPdf } from "../dist/node.js";
import { PDFDocument } from "pdf-lib";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const entryPoint = path.join(repo, "example", "remotion-entry.ts");
const output = path.join(repo, "example", "out.pdf");

const EXPECTED_PAGES = 2; // example/deck.tsx exports 2 slides

console.log("▶ rendering example deck → PDF…");
const result = await renderDeckToPdf({
  entryPoint,
  output,
  onProgress: ({ id, index, total }) =>
    console.log(`  · ${index + 1}/${total} ${id}`),
});

const assert = (cond, msg) => {
  if (!cond) {
    console.error("✗ SMOKE FAILED:", msg);
    process.exit(1);
  }
};

assert(fs.existsSync(output), "no PDF written");
const bytes = fs.readFileSync(output);
assert(bytes.length > 5000, `PDF suspiciously small (${bytes.length} bytes)`);

const loaded = await PDFDocument.load(bytes);
assert(
  loaded.getPageCount() === EXPECTED_PAGES,
  `expected ${EXPECTED_PAGES} pages, got ${loaded.getPageCount()}`,
);
assert(
  result.pages === EXPECTED_PAGES,
  `renderDeckToPdf reported ${result.pages} pages`,
);

console.log(
  `✓ smoke passed: ${loaded.getPageCount()} pages, ${bytes.length} bytes → ${path.relative(repo, output)}`,
);
