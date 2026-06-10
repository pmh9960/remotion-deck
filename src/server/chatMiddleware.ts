import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const INSTRUCTIONS = `You edit a presentation deck (the "remotion-deck" JSON schema). You are given the
CURRENT deck and an instruction. Respond with ONLY a MINIMAL JSON PATCH — no prose, no markdown
fences, no tools — of exactly this shape:
{
  "slides": [ <full objects for ONLY the slides you changed or added, each keeping its "id"> ],
  "order":  [ <the complete list of slide ids in final order — include this ONLY if you ADD, REMOVE or REORDER slides> ],
  "config": <object, ONLY if you changed deck-level config/theme>
}
Do NOT include slides you did not change (this keeps your answer short). A slide is
{ id, durationInFrames, background?, elements:[{ id, type:"text"|"image"|"shape", x, y, w, h,
text?|src?|shape?, style?, animation? }] }. Positions are pixels in a 1920x1080 space. style keys:
fontSize, fontWeight, color, align, lineHeight, letterSpacing, uppercase, gradientText, background,
borderRadius. animation.preset: none|fade|rise|slide-left|slide-up|pop|typewriter with a "start"
frame. Keep ids stable.`;

type DeckLike = { config?: unknown; slides?: { id: string }[] };
type Patch = { slides?: { id: string }[]; order?: string[]; config?: Record<string, unknown> };

/** Merge a minimal patch from Claude into the current deck. Robust to Claude returning a full
 *  deck too (overlay-by-id is idempotent). Deletions/reorders are expressed via patch.order. */
const applyPatch = (deck: DeckLike, patch: Patch): DeckLike => {
  const result: DeckLike = { ...deck };
  if (patch.config && typeof patch.config === "object") {
    result.config = { ...(deck.config as object), ...patch.config };
  }
  let slides = [...(deck.slides ?? [])];
  const byId = new Map(slides.map((s, i) => [s.id, i]));
  for (const s of patch.slides ?? []) {
    if (byId.has(s.id)) slides[byId.get(s.id) as number] = s;
    else slides.push(s);
  }
  if (Array.isArray(patch.order)) {
    const map = new Map(slides.map((s) => [s.id, s]));
    slides = patch.order.map((id) => map.get(id)).filter(Boolean) as { id: string }[];
  }
  result.slides = slides;
  return result;
};

/**
 * POST /__chat { message, deck, selection?, scope? } → edits the deck with the user's own Claude Code.
 *
 * Keeps ONE warm `claude` process alive for the server's lifetime (stream-json I/O), so only the
 * first turn pays cold-start; later turns are fast and share conversation context. The process:
 *  - loads NO MCP servers (the deck-editing agent doesn't need them; keeps the first turn lighter)
 *  - runs a fast model (haiku by default; override with REMOTION_DECK_MODEL)
 *  - is spawned with cwd = the deck project, so its session lives under that project (not scattered)
 *  - is killed when the dev server exits (so the launcher dying takes the child with it)
 */
export const chatMiddleware = (opts: { cwd: string }): Plugin => {
  const stateDir = path.join(opts.cwd, ".remotion-deck");
  const emptyMcp = path.join(stateDir, "empty-mcp.json");

  let child: ChildProcess | null = null;
  let buffer = "";
  let pending: { resolve: (s: string) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  let chain: Promise<unknown> = Promise.resolve();

  const failPending = (e: Error) => {
    if (pending) { const p = pending; pending = null; clearTimeout(p.timer); p.reject(e); }
  };

  const killChild = () => {
    if (!child) return;
    const pid = child.pid;
    child = null;
    buffer = "";
    if (process.platform === "win32" && pid) {
      try { spawn("taskkill", ["/pid", String(pid), "/t", "/f"], { shell: true }); } catch { /* ignore */ }
    } else if (pid) {
      try { process.kill(pid); } catch { /* ignore */ }
    }
  };

  // The warm Claude process must not outlive the dev server.
  process.once("exit", killChild);
  process.once("SIGINT", () => { killChild(); process.exit(0); });
  process.once("SIGTERM", () => { killChild(); process.exit(0); });

  const ensureProc = () => {
    if (child) return;
    fs.mkdirSync(stateDir, { recursive: true });
    if (!fs.existsSync(emptyMcp)) fs.writeFileSync(emptyMcp, '{"mcpServers":{}}');
    const model = process.env.REMOTION_DECK_MODEL || "haiku";
    const args = ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--strict-mcp-config", "--mcp-config", `"${emptyMcp}"`, "--model", model];
    child = spawn("claude", args, { cwd: opts.cwd, shell: true, env: process.env });
    child.stdout?.on("data", (d) => {
      buffer += d.toString();
      let nl;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let ev: { type?: string; result?: string };
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === "result" && pending) {
          const p = pending;
          pending = null;
          clearTimeout(p.timer);
          p.resolve(typeof ev.result === "string" ? ev.result : "");
        }
      }
    });
    child.on("exit", () => { child = null; failPending(new Error("claude process exited")); });
    child.on("error", (e) => { child = null; failPending(e as Error); });
  };

  const askOnce = (prompt: string) =>
    new Promise<string>((resolve, reject) => {
      ensureProc();
      if (!child || !child.stdin) { reject(new Error("could not start claude")); return; }
      const timer = setTimeout(() => failPending(new Error("claude timed out")), 180000);
      pending = { resolve, reject, timer };
      child.stdin.write(JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: prompt }] } }) + "\n");
    });

  // Serialize requests through the single warm process.
  const ask = (prompt: string): Promise<string> => {
    const result = chain.then(() => askOnce(prompt));
    chain = result.catch(() => {});
    return result;
  };

  return {
    name: "remotion-deck:chat-api",
    configureServer(server) {
      server.httpServer?.once("close", killChild);
      server.middlewares.use("/__chat", (req, res) => {
        if (req.method !== "POST") { res.statusCode = 405; res.end(); return; }
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", async () => {
          const send = (obj: unknown) => {
            res.statusCode = 200;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify(obj));
          };
          try {
            const { message, deck, selection, scope } = JSON.parse(body) as {
              message: string;
              deck: unknown;
              selection?: { slideId?: string; elementId?: string };
              scope?: "slide" | "deck";
            };
            const ctx = selection?.elementId
              ? `\nThe user currently has element "${selection.elementId}" on slide "${selection.slideId}" selected; "this"/"it" likely refers to it.`
              : selection?.slideId
                ? `\nThe user is currently viewing slide "${selection.slideId}".`
                : "";
            const scopeNote = scope === "slide" && selection?.slideId
              ? `\nOnly modify the slide with id "${selection.slideId}"; leave every other slide unchanged.`
              : "";
            const prompt = `${INSTRUCTIONS}\n\nCurrent deck JSON:\n${JSON.stringify(deck)}${ctx}${scopeNote}\n\nInstruction: ${message}`;

            const text = await ask(prompt);
            const start = text.indexOf("{");
            const end = text.lastIndexOf("}");
            if (start === -1 || end === -1) { send({ error: "Claude did not return a patch." }); return; }
            const patch = JSON.parse(text.slice(start, end + 1)) as Patch;
            send({ deck: applyPatch(deck as DeckLike, patch) });
          } catch (err) {
            const msg = String((err as Error)?.message ?? err);
            send({
              error: msg.includes("ENOENT")
                ? "`claude` CLI not found on PATH. Start `remotion-deck dev` from a shell where `claude` works."
                : msg,
            });
          }
        });
      });
    },
  };
};
