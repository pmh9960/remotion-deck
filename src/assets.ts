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
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

/**
 * Returns a copy of the deck with every `assets/<file>` image reference replaced by an inlined
 * data-URL (read from <cwd>/assets). Used by the PDF and self-contained HTML exports so they keep
 * working with no server. data-URL and http(s) srcs are left untouched.
 *
 * `opts.video`:
 *  - "inline" (default) — videos are inlined as data-URLs too (HTML export: the browser plays a
 *    `data:` video directly).
 *  - "skip" — videos are left as `assets/<file>`. The PDF export uses this: Remotion's
 *    OffthreadVideo fetches its src through a local proxy as a *query parameter*, and a multi-MB
 *    base64 data-URL blows past the URL/header size limit (HTTP 431). The PDF path instead copies
 *    the video files into the render bundle's publicDir and references them via `staticFile()`.
 */
export const inlineAssets = (
  deck: DeckJson,
  cwd: string,
  opts: { video?: "inline" | "skip" } = {},
): DeckJson => {
  const inlineVideo = (opts.video ?? "inline") === "inline";
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
      elements: s.elements.map((el) => {
        if (el.type === "image" && el.src.startsWith("assets/")) return { ...el, src: toDataUrl(el.src) };
        if (el.type === "video" && el.src.startsWith("assets/") && inlineVideo) return { ...el, src: toDataUrl(el.src) };
        return el;
      }),
    })),
  };
};

/** Collect every `assets/<file>` reference used by an image element in the deck. */
export const referencedAssets = (deck: DeckJson): string[] => {
  const refs = new Set<string>();
  for (const s of deck.slides) {
    for (const el of s.elements) {
      if ((el.type === "image" || el.type === "video") && el.src.startsWith("assets/")) refs.add(el.src);
    }
  }
  return [...refs];
};
