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

export type ChatSelection = { slideId?: string; elementId?: string };
export type AskOption = { label: string; description?: string };
export type AskQuestion = { question: string; header?: string; multiSelect?: boolean; options: AskOption[] };
export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool"; name: string; detail: string }
  | { type: "ask"; id: string; questions: AskQuestion[] }
  | { type: "done"; reply?: string }
  | { type: "error"; error: string };

/**
 * Stream one turn of the deck-editing Claude Code session. The server edits the deck FILE directly
 * and streams newline-delimited JSON events (text chunks, tool markers, then done/error). After a
 * `done`, reload the deck (loadDeck) to pick up the file edits. Commit the current in-memory deck
 * to disk (saveDeck(deck, "commit")) BEFORE calling this so Claude reads the latest state.
 */
export const chatStream = async (
  message: string,
  selection: ChatSelection | undefined,
  scope: "slide" | "deck" | undefined,
  onEvent: (e: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<void> => {
  const res = await fetch("/__chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, selection, scope }),
    signal,
  });
  if (!res.body) { onEvent({ type: "error", error: "no response stream" }); return; }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) { try { onEvent(JSON.parse(line) as ChatEvent); } catch { /* skip partial */ } }
    }
  }
  // Flush a trailing line that wasn't newline-terminated, so a final event (e.g. done) is never lost.
  const tail = buf.trim();
  if (tail) { try { onEvent(JSON.parse(tail) as ChatEvent); } catch { /* ignore */ } }
};

/** Interrupt the in-flight chat turn on the server (kills the warm process; it respawns next turn). */
export const stopChat = async (): Promise<void> => {
  await fetch("/__chat/stop", { method: "POST" }).catch(() => {});
};

