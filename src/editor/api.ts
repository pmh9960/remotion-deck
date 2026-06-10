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
