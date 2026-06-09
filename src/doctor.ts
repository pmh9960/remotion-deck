import type { DeckJson, SlideJson, SlideElement, TextElement } from "./schema.js";

/** Elements whose left edge (or top) sits within this many px snap to a shared line. */
const ALIGN_TOL = 16;

/** Group near-equal numbers; return a map from each value to its cluster's rounded mean. */
const cluster = (values: number[], tol: number): Map<number, number> => {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const map = new Map<number, number>();
  let group: number[] = [];
  const flush = () => {
    if (!group.length) return;
    const rep = Math.round(group.reduce((s, v) => s + v, 0) / group.length);
    group.forEach((v) => map.set(v, rep));
    group = [];
  };
  for (const v of sorted) {
    if (group.length && v - group[group.length - 1] > tol) flush();
    group.push(v);
  }
  flush();
  return map;
};

const tidyText = (t: string): string =>
  t
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+$/g, "");

export type DoctorResult = { deck: DeckJson; changes: string[] };

/**
 * Normalize a deck: snap ragged left edges and rows onto shared lines, round all
 * geometry to integers, and trim trailing whitespace from text. Deterministic and
 * conservative — it tidies layout without restructuring content.
 */
export const doctorDeck = (input: DeckJson): DoctorResult => {
  const changes: string[] = [];

  const slides: SlideJson[] = input.slides.map((slide) => {
    const xMap = cluster(slide.elements.map((e) => e.x), ALIGN_TOL);
    const yMap = cluster(slide.elements.map((e) => e.y), ALIGN_TOL);

    const elements: SlideElement[] = slide.elements.map((el) => {
      const next: SlideElement = { ...el };
      const sx = xMap.get(el.x) ?? Math.round(el.x);
      const sy = yMap.get(el.y) ?? Math.round(el.y);

      if (sx !== el.x) {
        changes.push(`${slide.id}/${el.id}: x ${el.x} → ${sx}`);
        next.x = sx;
      }
      if (sy !== el.y) {
        changes.push(`${slide.id}/${el.id}: y ${el.y} → ${sy}`);
        next.y = sy;
      }
      next.w = Math.round(el.w);
      next.h = Math.round(el.h);

      if (el.type === "text") {
        const tidy = tidyText(el.text);
        if (tidy !== el.text) {
          changes.push(`${slide.id}/${el.id}: tidied text`);
          return { ...(next as TextElement), text: tidy };
        }
      }
      return next;
    });

    return { ...slide, elements };
  });

  return { deck: { ...input, slides }, changes };
};
