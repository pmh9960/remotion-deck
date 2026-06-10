// Unit tests for the pure logic modules, run against the BUILT dist via `node --test`.
// Zero extra deps (uses node:test / node:assert), matching the smoke-test style.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { computeElementStyle } from "../dist/animations.js";
import { inlineAssets, referencedAssets } from "../dist/assets.js";
import { doctorDeck } from "../dist/doctor.js";
import { parseDeck, resolveDeckConfig, resolveTheme } from "../dist/schema.js";

const slide = (elements) => ({ id: "s1", durationInFrames: 90, elements });

// ── animations ───────────────────────────────────────────────────────────────
test("computeElementStyle: 'none' is fully shown", () => {
  const a = computeElementStyle({ animation: { preset: "none", start: 0 } }, 0, 30);
  assert.equal(a.opacity, 1);
  assert.equal(a.transform, "none");
  assert.equal(a.textRevealFrac, 1);
});

test("computeElementStyle: hidden before its start frame", () => {
  const a = computeElementStyle({ animation: { preset: "fade", start: 10 } }, 4, 30);
  assert.equal(a.opacity, 0);
  assert.equal(a.textRevealFrac, 0);
});

test("computeElementStyle: fade ramps 0→1 over its duration", () => {
  const el = { animation: { preset: "fade", start: 0, duration: 15 } };
  assert.equal(computeElementStyle(el, 0, 30).opacity, 0);
  assert.equal(computeElementStyle(el, 15, 30).opacity, 1);
  assert.equal(computeElementStyle(el, 999, 30).opacity, 1); // clamps
});

test("computeElementStyle: typewriter reveals 0→1", () => {
  const el = { animation: { preset: "typewriter", start: 0, duration: 30 } };
  assert.equal(computeElementStyle(el, 0, 30).textRevealFrac, 0);
  assert.equal(computeElementStyle(el, 30, 30).textRevealFrac, 1);
});

// ── schema ───────────────────────────────────────────────────────────────────
test("parseDeck: accepts a valid deck", () => {
  const deck = { slides: [slide([])] };
  assert.equal(parseDeck(deck), deck);
});

test("parseDeck: rejects malformed input", () => {
  assert.throws(() => parseDeck(null));
  assert.throws(() => parseDeck({}));
  assert.throws(() => parseDeck({ slides: [{ id: 1, durationInFrames: 1, elements: [] }] }));
  assert.throws(() => parseDeck({ slides: [{ id: "a", elements: [] }] }));
});

test("resolveTheme / resolveDeckConfig: defaults + overrides", () => {
  const t = resolveTheme();
  assert.equal(typeof t.accent1, "string");
  assert.equal(resolveTheme({ accent1: "#000" }).accent1, "#000");
  assert.deepEqual(resolveDeckConfig(), { fps: 30, width: 1920, height: 1080 });
  assert.equal(resolveDeckConfig({ fps: 60 }).fps, 60);
});

// ── doctor ───────────────────────────────────────────────────────────────────
test("doctorDeck: snaps near-equal left edges to a shared line", () => {
  const deck = { slides: [slide([
    { id: "a", type: "shape", x: 100, y: 50, w: 10, h: 10 },
    { id: "b", type: "shape", x: 110, y: 50, w: 10, h: 10 },
  ])] };
  const { deck: fixed, changes } = doctorDeck(deck);
  const xs = fixed.slides[0].elements.map((e) => e.x);
  assert.equal(xs[0], xs[1]); // both snapped to the same line
  assert.equal(xs[0], 105); // rounded mean of 100 and 110
  assert.ok(changes.length >= 2);
});

test("doctorDeck: trims trailing whitespace in text", () => {
  const deck = { slides: [slide([{ id: "t", type: "text", text: "hello   \nworld", x: 0, y: 0, w: 10, h: 10 }])] };
  const { deck: fixed, changes } = doctorDeck(deck);
  assert.equal(fixed.slides[0].elements[0].text, "hello\nworld");
  assert.ok(changes.some((c) => c.includes("tidied text")));
});

test("doctorDeck: a tidy deck yields no changes", () => {
  const deck = { slides: [slide([{ id: "a", type: "shape", x: 100, y: 50, w: 10, h: 10 }])] };
  assert.equal(doctorDeck(deck).changes.length, 0);
});

// ── assets ───────────────────────────────────────────────────────────────────
test("referencedAssets: only collects assets/ image refs", () => {
  const deck = { slides: [slide([
    { id: "i1", type: "image", src: "assets/a.png", x: 0, y: 0, w: 1, h: 1 },
    { id: "i2", type: "image", src: "data:image/gif;base64,AAAA", x: 0, y: 0, w: 1, h: 1 },
    { id: "t", type: "text", text: "x", x: 0, y: 0, w: 1, h: 1 },
  ])] };
  assert.deepEqual(referencedAssets(deck), ["assets/a.png"]);
});

test("inlineAssets: inlines assets/ files, leaves data-URLs, doesn't mutate input", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rd-assets-"));
  fs.mkdirSync(path.join(dir, "assets"));
  fs.writeFileSync(path.join(dir, "assets", "a.png"), Buffer.from("PNGDATA"));
  const deck = { slides: [slide([
    { id: "i1", type: "image", src: "assets/a.png", x: 0, y: 0, w: 1, h: 1 },
    { id: "i2", type: "image", src: "data:image/gif;base64,AAAA", x: 0, y: 0, w: 1, h: 1 },
  ])] };
  const out = inlineAssets(deck, dir);
  assert.ok(out.slides[0].elements[0].src.startsWith("data:image/png;base64,"));
  assert.equal(out.slides[0].elements[1].src, "data:image/gif;base64,AAAA");
  assert.equal(deck.slides[0].elements[0].src, "assets/a.png"); // original untouched
  fs.rmSync(dir, { recursive: true, force: true });
});

test("inlineAssets: a missing asset file is left as-is", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rd-assets-"));
  const deck = { slides: [slide([{ id: "i", type: "image", src: "assets/missing.png", x: 0, y: 0, w: 1, h: 1 }])] };
  assert.equal(inlineAssets(deck, dir).slides[0].elements[0].src, "assets/missing.png");
  fs.rmSync(dir, { recursive: true, force: true });
});
