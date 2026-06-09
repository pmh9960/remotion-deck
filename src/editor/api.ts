import type { DeckJson } from "../schema.js";

export const loadDeck = async (): Promise<DeckJson> => {
  const res = await fetch("/__deck");
  return res.json();
};

export const saveDeck = async (deck: DeckJson): Promise<void> => {
  await fetch("/__deck", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(deck),
  });
};
