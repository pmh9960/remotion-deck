import fs from "node:fs";
import path from "node:path";
import { inlineAssets } from "./assets.js";
import type { DeckJson } from "./schema.js";

/**
 * Prepare a temporary Remotion entry for PDF rendering of `deck`, plus the publicDir to serve.
 *
 * Images are inlined as data-URLs (an <img> renders a `data:` URL directly — no proxy). Videos are
 * NOT inlined: Remotion's OffthreadVideo fetches its src through a local proxy as a *query
 * parameter*, so a multi-MB base64 data-URL overflows the URL/header size limit and the render dies
 * with `Server returned status 431`. Instead each referenced video is copied into `<tmpDir>/public`
 * and the entry rewrites its src via `staticFile("<name>")` → a short bundle URL the proxy accepts.
 *
 * Returns { entryPoint, publicDir, tmpDir }. The caller renders, then removes tmpDir.
 */
export const writePdfEntry = (
  deck: DeckJson,
  cwd: string,
): { entryPoint: string; publicDir: string; tmpDir: string } => {
  const embedded = inlineAssets(deck, cwd, { video: "skip" });
  const tmpDir = path.join(cwd, ".remotion-deck");
  const publicDir = path.join(tmpDir, "public");
  fs.mkdirSync(publicDir, { recursive: true });

  for (const s of embedded.slides) {
    for (const el of s.elements as Array<Record<string, unknown>>) {
      if (el.type === "video" && typeof el.src === "string" && el.src.startsWith("assets/")) {
        const base = path.basename(el.src);
        const from = path.join(cwd, "assets", base);
        if (!fs.existsSync(from)) continue;
        fs.copyFileSync(from, path.join(publicDir, base));
        el.src = base; // served at the bundle origin root
        el.__static = true; // entry resolves this via staticFile()
      }
    }
  }

  const entryPoint = path.join(tmpDir, "entry.tsx");
  fs.writeFileSync(
    entryPoint,
    `import { registerDeck, deckFromJson } from "remotion-deck";\n` +
      `import { staticFile } from "remotion";\n` +
      `const deck = ${JSON.stringify(embedded)};\n` +
      `for (const s of deck.slides) for (const el of s.elements) { if (el.__static) { el.src = staticFile(el.src); delete el.__static; } }\n` +
      `const { slides, config } = deckFromJson(deck);\n` +
      `registerDeck(slides, config);\n`,
  );
  return { entryPoint, publicDir, tmpDir };
};
