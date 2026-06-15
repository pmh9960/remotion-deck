import { bundle } from "@remotion/bundler";
import { getCompositions, renderStill } from "@remotion/renderer";
import { PDFDocument } from "pdf-lib";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Note: this module intentionally has NO relative runtime imports so that the
// emitted dist/node.js runs directly under Node's ESM loader (which requires
// file extensions on relative specifiers). Bare specifiers and node: builtins
// are fine. Types are declared locally for the same reason.

type CompositionInfo = {
  id: string;
  durationInFrames: number;
  width: number;
  height: number;
};

/** Which frame of each slide to capture into the PDF. Default: the last frame. */
export type FrameSelector =
  | "last"
  | number
  | ((composition: CompositionInfo) => number);

export type RenderDeckToPdfOptions = {
  /** Path to the Remotion entry file that calls registerDeck(...). */
  entryPoint: string;
  /** Where to write the resulting PDF. */
  output: string;
  /** Which frame to snapshot per slide. Default "last". */
  frame?: FrameSelector;
  /** Restrict/filter or reorder slides by composition id. Default: all, in registration order. */
  only?: string[];
  /** Progress callback, fired once per rendered slide. */
  onProgress?: (event: { id: string; index: number; total: number }) => void;
  /**
   * Directory served as Remotion's `public/` for this render. Files here are reachable via
   * `staticFile("<name>")` from the entry/components. The PDF export uses this for videos so
   * OffthreadVideo fetches a short URL instead of a giant base64 data-URL (which 431s — see
   * inlineAssets `video: "skip"`).
   */
  publicDir?: string;
};

export type RenderDeckToPdfResult = {
  output: string;
  pages: number;
};

const pickFrame = (selector: FrameSelector, comp: CompositionInfo): number => {
  if (selector === "last") return comp.durationInFrames - 1;
  if (typeof selector === "number") {
    return Math.max(0, Math.min(comp.durationInFrames - 1, selector));
  }
  return Math.max(0, Math.min(comp.durationInFrames - 1, selector(comp)));
};

/**
 * Render every slide's chosen frame to an image and stitch them into one PDF,
 * one slide per page at the composition's native resolution.
 *
 * The deck is described entirely by the Remotion entry (which registers the
 * compositions), so this works with whatever Remotion version is installed.
 */
export async function renderDeckToPdf(
  options: RenderDeckToPdfOptions,
): Promise<RenderDeckToPdfResult> {
  const { entryPoint, output, frame = "last", only, onProgress, publicDir } = options;

  // registerDeck() calls Remotion's registerRoot() for the user, so the entry file
  // won't contain the literal "registerRoot" that the bundler statically looks for.
  const serveUrl = await bundle({ entryPoint, ignoreRegisterRootWarning: true, publicDir });
  const all = await getCompositions(serveUrl);

  const compositions = only
    ? (only
        .map((id) => all.find((c) => c.id === id))
        .filter(Boolean) as typeof all)
    : all;

  if (compositions.length === 0) {
    throw new Error(
      "remotion-deck: no compositions found. Did your entry call registerDeck(slides)?",
    );
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "remotion-deck-"));
  const pdf = await PDFDocument.create();

  try {
    let index = 0;
    for (const comp of compositions) {
      const targetFrame = pickFrame(frame, comp);
      const png = path.join(tmpDir, `${comp.id}.png`);

      await renderStill({
        composition: comp,
        serveUrl,
        output: png,
        frame: targetFrame,
        imageFormat: "png",
      });

      const embedded = await pdf.embedPng(fs.readFileSync(png));
      const page = pdf.addPage([comp.width, comp.height]);
      page.drawImage(embedded, {
        x: 0,
        y: 0,
        width: comp.width,
        height: comp.height,
      });

      onProgress?.({ id: comp.id, index, total: compositions.length });
      index += 1;
    }

    const bytes = await pdf.save();
    fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
    fs.writeFileSync(output, bytes);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  return { output, pages: compositions.length };
}
