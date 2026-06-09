import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { deckFromJson } from "../deckFromJson.js";
import { SlideDeck } from "../SlideDeck.js";
import { resolveDeckConfig, type DeckJson } from "../schema.js";
import { loadDeck } from "./api.js";

const Present = () => {
  const [deck, setDeck] = useState<DeckJson | null>(null);
  useEffect(() => {
    loadDeck().then(setDeck);
  }, []);
  if (!deck) return null;
  return <SlideDeck slides={deckFromJson(deck).slides} config={resolveDeckConfig(deck.config)} />;
};

/** Entry mounted by the CLI present server (`remotion-deck present`). */
export const mount = (el: HTMLElement) => {
  createRoot(el).render(<Present />);
};
