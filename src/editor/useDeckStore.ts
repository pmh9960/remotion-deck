import { useCallback, useEffect, useRef, useState } from "react";
import type { DeckJson } from "../schema.js";
import { gcAssets, loadDeck, saveDeck } from "./api.js";

export type DeckStore = {
  deck: DeckJson | null;
  /**
   * Replace the deck and debounce-autosave to the sidecar.
   * History is **action-based**, not time-based: pass `transient: true` for the
   * intermediate steps of one continuous gesture (a drag, a resize, a run of
   * keystrokes) so the whole gesture collapses into a single undo step, closed
   * by `commit()`. Omit `transient` for a discrete action — each one is its own
   * undo step.
   */
  update: (next: DeckJson, transient?: boolean) => void;
  /** End the current gesture so the next change begins a fresh undo step. */
  commit: () => void;
  undo: () => void;
  redo: () => void;
  /** Commit to deck.json (Ctrl+S). */
  save: () => void;
  /** "saved" = committed to deck.json; "draft" = autosaved to sidecar only. */
  status: "loading" | "saving" | "draft" | "saved";
};

const HISTORY_LIMIT = 100;

export const useDeckStore = (): DeckStore => {
  const [deck, setDeckState] = useState<DeckJson | null>(null);
  const deckRef = useRef<DeckJson | null>(null);
  const past = useRef<DeckJson[]>([]);
  const future = useRef<DeckJson[]>([]);
  // A gesture is "open" once its first transient update records a baseline; it
  // stays open (so further moves don't add steps) until commit()/undo()/redo().
  const txnOpen = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gcTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<DeckStore["status"]>("loading");

  // Assets still reachable = referenced by the current deck OR any state we can undo/redo back
  // to. Anything outside this set has fallen out of history and can be reclaimed on the server.
  const reachableAssets = (): string[] => {
    const set = new Set<string>();
    const scan = (d: DeckJson | null) => {
      if (!d) return;
      for (const s of d.slides) for (const el of s.elements) {
        if (el.type === "image" && el.src.startsWith("assets/")) set.add(el.src);
      }
    };
    scan(deckRef.current);
    past.current.forEach(scan);
    future.current.forEach(scan);
    return [...set];
  };
  const scheduleGc = () => {
    if (gcTimer.current) clearTimeout(gcTimer.current);
    gcTimer.current = setTimeout(() => gcAssets(reachableAssets()), 1500);
  };

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

  const pushHistory = (prev: DeckJson | null) => {
    if (!prev) return;
    past.current.push(prev);
    if (past.current.length > HISTORY_LIMIT) past.current.shift();
    future.current = [];
  };

  const update = useCallback((next: DeckJson, transient = false) => {
    const prev = deckRef.current;
    if (transient) {
      // First step of a gesture records the baseline; later steps don't.
      if (!txnOpen.current) {
        pushHistory(prev);
        txnOpen.current = true;
      }
    } else {
      // A discrete action: close any stray gesture and record its own step.
      txnOpen.current = false;
      pushHistory(prev);
    }
    setDeck(next);
    scheduleAutosave(next);
    scheduleGc();
  }, []);

  const commit = useCallback(() => {
    txnOpen.current = false;
  }, []);

  const undo = useCallback(() => {
    if (!past.current.length || !deckRef.current) return;
    txnOpen.current = false;
    const prev = past.current.pop() as DeckJson;
    future.current.push(deckRef.current);
    setDeck(prev);
    scheduleAutosave(prev);
    scheduleGc();
  }, []);

  const redo = useCallback(() => {
    if (!future.current.length || !deckRef.current) return;
    txnOpen.current = false;
    const next = future.current.pop() as DeckJson;
    past.current.push(deckRef.current);
    setDeck(next);
    scheduleAutosave(next);
    scheduleGc();
  }, []);

  const save = useCallback(() => {
    if (!deckRef.current) return;
    if (timer.current) clearTimeout(timer.current);
    setStatus("saving");
    saveDeck(deckRef.current, "commit").then(() => setStatus("saved"));
    gcAssets(reachableAssets());
  }, []);

  return { deck, update, commit, undo, redo, save, status };
};
