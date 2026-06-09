import { useCallback, useEffect, useRef, useState } from "react";
import type { DeckJson } from "../schema.js";
import { loadDeck, saveDeck } from "./api.js";

export type DeckStore = {
  deck: DeckJson | null;
  /** Replace the deck, record an undo step, and debounce-autosave to the sidecar. */
  update: (next: DeckJson) => void;
  undo: () => void;
  redo: () => void;
  /** Commit to deck.json (Ctrl+S). */
  save: () => void;
  /** "saved" = committed to deck.json; "draft" = autosaved to sidecar only. */
  status: "loading" | "saving" | "draft" | "saved";
};

const HISTORY_LIMIT = 100;
const COALESCE_MS = 500;

export const useDeckStore = (): DeckStore => {
  const [deck, setDeckState] = useState<DeckJson | null>(null);
  const deckRef = useRef<DeckJson | null>(null);
  const past = useRef<DeckJson[]>([]);
  const future = useRef<DeckJson[]>([]);
  const lastPush = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<DeckStore["status"]>("loading");

  const setDeck = (d: DeckJson) => {
    deckRef.current = d;
    setDeckState(d);
  };

  useEffect(() => {
    loadDeck().then((d) => {
      setDeck(d);
      setStatus("saved");
    });
  }, []);

  // Debounced silent autosave to the sidecar file (does not touch deck.json).
  const scheduleAutosave = (d: DeckJson) => {
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await saveDeck(d, "autosave");
      setStatus("draft");
    }, 400);
  };

  const update = useCallback((next: DeckJson) => {
    const prev = deckRef.current;
    const now = Date.now();
    if (prev && now - lastPush.current > COALESCE_MS) {
      past.current.push(prev);
      if (past.current.length > HISTORY_LIMIT) past.current.shift();
      lastPush.current = now;
    }
    future.current = [];
    setDeck(next);
    scheduleAutosave(next);
  }, []);

  const undo = useCallback(() => {
    if (!past.current.length || !deckRef.current) return;
    const prev = past.current.pop() as DeckJson;
    future.current.push(deckRef.current);
    lastPush.current = 0;
    setDeck(prev);
    scheduleAutosave(prev);
  }, []);

  const redo = useCallback(() => {
    if (!future.current.length || !deckRef.current) return;
    const next = future.current.pop() as DeckJson;
    past.current.push(deckRef.current);
    setDeck(next);
    scheduleAutosave(next);
  }, []);

  const save = useCallback(() => {
    if (!deckRef.current) return;
    if (timer.current) clearTimeout(timer.current);
    setStatus("saving");
    saveDeck(deckRef.current, "commit").then(() => setStatus("saved"));
  }, []);

  return { deck, update, undo, redo, save, status };
};
