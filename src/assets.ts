import fs from "node:fs";
import path from "node:path";
import type { DeckJson } from "./schema.js";

const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
};

/**
 * Returns a copy of the deck with every `assets/<file>` image reference replaced by an inlined
 * data-URL (read from <cwd>/assets). Used by the PDF and self-contained HTML exports so they keep
 * working with no server. data-URL and http(s) srcs are left untouched.
 */
export const inlineAssets = (deck: DeckJson, cwd: string): DeckJson => {
  const toDataUrl = (ref: string): string => {
    const file = path.basename(ref);
    const full = path.join(cwd, "assets", file);
    if (!fs.existsSync(full)) return ref;
    const ext = path.extname(full).slice(1).toLowerCase();
    const mime = EXT_MIME[ext] ?? "application/octet-stream";
    return `data:${mime};base64,${fs.readFileSync(full).toString("base64")}`;
  };
  return {
    ...deck,
    slides: deck.slides.map((s) => ({
      ...s,
      elements: s.elements.map((el) =>
        el.type === "image" && el.src.startsWith("assets/") ? { ...el, src: toDataUrl(el.src) } : el,
      ),
    })),
  };
};

/** Collect every `assets/<file>` reference used by an image element in the deck. */
export const referencedAssets = (deck: DeckJson): string[] => {
  const refs = new Set<string>();
  for (const s of deck.slides) {
    for (const el of s.elements) {
      if (el.type === "image" && el.src.startsWith("assets/")) refs.add(el.src);
    }
  }
  return [...refs];
};
