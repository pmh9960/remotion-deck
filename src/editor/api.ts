import type { DeckJson } from "../schema.js";

export const loadDeck = async (): Promise<DeckJson> => {
  const res = await fetch("/__deck");
  return res.json();
};

/** "autosave" → sidecar deck.autosave.json (silent); "commit" → deck.json (Ctrl+S). */
export const saveDeck = async (deck: DeckJson, mode: "autosave" | "commit" = "autosave"): Promise<void> => {
  await fetch(mode === "commit" ? "/__deck?mode=commit" : "/__deck", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(deck),
  });
};

/** Upload an image data-URL; the server stores it as a file and returns its `assets/<file>` path. */
export const uploadAsset = async (dataUrl: string): Promise<string> => {
  const res = await fetch("/__asset", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataUrl }),
  });
  const data = (await res.json()) as { path?: string };
  if (!data.path) throw new Error("asset upload failed");
  return data.path;
};

/** Tell the server which `assets/<file>` refs are still reachable; it deletes the rest. */
export const gcAssets = async (keep: string[]): Promise<void> => {
  await fetch("/__assets/gc", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ keep }),
  }).catch(() => {});
};

export type ChatReply = { deck?: DeckJson; error?: string };
export type ChatSelection = { slideId?: string; elementId?: string };

export const chatEdit = async (message: string, deck: DeckJson, selection?: ChatSelection, scope?: "slide" | "deck"): Promise<ChatReply> => {
  const res = await fetch("/__chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, deck, selection, scope }),
  });
  return res.json();
};
