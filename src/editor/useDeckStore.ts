import { useCallback, useEffect, useRef, useState } from "react";
import type { DeckJson } from "../schema.js";
import { loadDeck, saveDeck } from "./api.js";

export type DeckStore = {
  deck: DeckJson | null;
  /** Replace the deck and schedule a debounced save to disk. */
  update: (next: DeckJson) => void;
  status: "loading" | "saved" | "saving";
};

/** Loads deck.json once, then debounce-saves every change back to /__deck. */
export const useDeckStore = (): DeckStore => {
  const [deck, setDeck] = useState<DeckJson | null>(null);
  const [status, setStatus] = useState<DeckStore["status"]>("loading");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadDeck().then((d) => {
      setDeck(d);
      setStatus("saved");
    });
  }, []);

  const update = useCallback((next: DeckJson) => {
    setDeck(next);
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await saveDeck(next);
      setStatus("saved");
    }, 400);
  }, []);

  return { deck, update, status };
};
