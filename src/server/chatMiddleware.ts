import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

/** First-turn preamble: turns the warm process into a deck-aware Claude Code session that edits
 *  the deck file directly. Sent once; the warm process keeps context for later turns. */
const preamble = (deckRel: string) =>
  `You are Claude, embedded as the chat assistant inside the "remotion-deck" visual slide editor — ` +
  `treat this as a normal Claude Code session: converse naturally and use your tools.\n` +
  `The presentation is the file \`${deckRel}\` in your working directory. It is remotion-deck JSON: ` +
  `a top-level { config, slides: [ { id, durationInFrames, background?, elements: [ { id, ` +
  `type:"text"|"image"|"shape", x, y, w, h, text?|src?|shape?, style?, animation? } ] } ] }. ` +
  `Positions are pixels in a 1920x1080 space; style keys include fontSize, fontWeight, color, align, ` +
  `lineHeight, letterSpacing, uppercase, gradientText, background, borderRadius, objectFit; ` +
  `animation.preset is one of none|fade|rise|slide-left|slide-up|pop|typewriter with a "start" frame.\n` +
  `To change the deck, EDIT \`${deckRel}\` directly (Read it, then Edit/Write) — the editor live-reloads ` +
  `the file the moment you finish, so the user sees your changes. Keep element and slide ids stable. ` +
  `When the user just asks a question, answer conversationally without editing. Keep replies concise.\n` +
  `When you need a decision from the user, call the AskUserQuestion tool — the editor shows your ` +
  `options as buttons and the user's choice arrives as their NEXT message. After asking, STOP and ` +
  `wait for that next message; do NOT assume an answer or proceed on your own.`;

/**
 * POST /__chat { message, selection?, scope? } → streams a turn of the user's own Claude Code,
 * as newline-delimited JSON (application/x-ndjson). Each line is one event:
 *   {"type":"text","text":"…"}   incremental assistant text
 *   {"type":"tool","name":"Edit"} a tool the assistant invoked (e.g. editing the deck file)
 *   {"type":"done"}               the turn finished (client should reload the deck file)
 *   {"type":"error","error":"…"}  the turn failed
 *
 * Keeps ONE warm `claude` process alive for the server's lifetime (stream-json I/O), so only the
 * first turn pays cold-start and later turns share conversation context (real back-and-forth). The
 * process edits the deck FILE directly (permission-mode acceptEdits), loads NO MCP servers, runs a
 * capable model (opus by default; override REMOTION_DECK_MODEL, e.g. sonnet/haiku for speed), is spawned with cwd = the deck
 * project, and is killed when the dev server exits.
 */
export const chatMiddleware = (opts: { cwd: string; deckFile: string }): Plugin => {
  const stateDir = path.join(opts.cwd, ".remotion-deck");
  const emptyMcp = path.join(stateDir, "empty-mcp.json");
  const deckRel = path.relative(opts.cwd, opts.deckFile) || path.basename(opts.deckFile);

  type Ev =
    | { type: "text"; text: string }
    | { type: "thinking"; text: string }
    | { type: "tool"; name: string; detail: string }
    | { type: "ask"; id: string; questions: unknown };

  // A short, human-readable summary of a tool call's target (file / command / pattern / url).
  const toolDetail = (input?: Record<string, unknown>): string => {
    if (!input || typeof input !== "object") return "";
    const f = input.file_path ?? input.path ?? input.notebook_path;
    if (typeof f === "string") return f.split("/").slice(-2).join("/");
    for (const k of ["command", "pattern", "query", "url", "prompt"]) {
      const v = input[k];
      if (typeof v === "string") return v.length > 64 ? v.slice(0, 61) + "…" : v;
    }
    return "";
  };
  type Pending = { onEvent: (e: Ev) => void; resolve: (s: string) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

  let child: ChildProcess | null = null;
  let buffer = "";
  let pending: Pending | null = null;
  let chain: Promise<unknown> = Promise.resolve();
  let turns = 0;

  // No turn timeout by default: Claude can sit silently THINKING for a long time with no stdout, so
  // even an idle watchdog would misfire. A turn ends only when the process finishes (result), dies
  // (exit/error → failPending), or the user hits stop. Set REMOTION_DECK_TIMEOUT_MS>0 to opt into an
  // idle watchdog (fails the turn after that many ms of NO output; every streamed event re-arms it).
  const IDLE_MS = (() => {
    const v = process.env.REMOTION_DECK_TIMEOUT_MS;
    if (v === undefined) return 0; // default: disabled
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0; // 0 / invalid → no timeout
  })();
  const armIdle = (p: Pending) => {
    clearTimeout(p.timer);
    if (IDLE_MS > 0) {
      p.timer = setTimeout(
        () => failPending(new Error(`claude produced no output for ${Math.round(IDLE_MS / 1000)}s — assuming it hung. Press stop and retry, or set REMOTION_DECK_TIMEOUT_MS.`)),
        IDLE_MS,
      );
    }
  };

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

  process.once("exit", killChild);
  process.once("SIGINT", () => { killChild(); process.exit(0); });
  process.once("SIGTERM", () => { killChild(); process.exit(0); });

  const ensureProc = () => {
    if (child) return;
    fs.mkdirSync(stateDir, { recursive: true });
    if (!fs.existsSync(emptyMcp)) fs.writeFileSync(emptyMcp, '{"mcpServers":{}}');
    const model = process.env.REMOTION_DECK_MODEL || "opus";
    const permission = process.env.REMOTION_DECK_PERMISSION || "acceptEdits";
    const args = ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--permission-mode", permission, "--strict-mcp-config", "--mcp-config", `"${emptyMcp}"`, "--model", model];
    child = spawn("claude", args, { cwd: opts.cwd, shell: true, env: process.env });
    turns = 0;
    child.stdout?.on("data", (d) => {
      buffer += d.toString();
      let nl;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let ev: { type?: string; result?: string; message?: { content?: Array<{ type?: string; text?: string; thinking?: string; name?: string; id?: string; input?: Record<string, unknown> }> } };
        try { ev = JSON.parse(line); } catch { continue; }
        if (!pending) continue;
        armIdle(pending); // the process is alive and talking → reset the idle watchdog
        if (ev.type === "assistant" && ev.message?.content) {
          for (const block of ev.message.content) {
            if (block.type === "text" && block.text) pending.onEvent({ type: "text", text: block.text });
            else if (block.type === "thinking" && block.thinking) pending.onEvent({ type: "thinking", text: block.thinking });
            else if (block.type === "tool_use" && block.name === "AskUserQuestion" && block.id) {
              // Interactive question — forward it to the client so it can show the options as buttons.
              pending.onEvent({ type: "ask", id: block.id, questions: block.input?.questions });
            } else if (block.type === "tool_use" && block.name) pending.onEvent({ type: "tool", name: block.name, detail: toolDetail(block.input) });
          }
        } else if (ev.type === "result") {
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

  // Run one turn through the warm process, forwarding streamed events to onEvent. Resolves with the
  // final result text once the turn completes.
  const askOnce = (prompt: string, onEvent: (e: Ev) => void) =>
    new Promise<string>((resolve, reject) => {
      ensureProc();
      if (!child || !child.stdin) { reject(new Error("could not start claude")); return; }
      const timer = setTimeout(() => {}, 0); // placeholder; armIdle re-arms with the real idle window
      pending = { onEvent, resolve, reject, timer };
      armIdle(pending);
      turns += 1;
      child.stdin.write(JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: prompt }] } }) + "\n");
    });

  // Serialize turns through the single warm process.
  const ask = (prompt: string, onEvent: (e: Ev) => void): Promise<string> => {
    const result = chain.then(() => askOnce(prompt, onEvent));
    chain = result.catch(() => {});
    return result;
  };

  return {
    name: "remotion-deck:chat-api",
    configureServer(server) {
      server.httpServer?.once("close", killChild);
      // POST /__chat/stop → interrupt the in-flight turn by killing the warm process (it respawns on
      // the next message). Registered before /__chat so the prefix match doesn't swallow it.
      server.middlewares.use("/__chat/stop", (req, res) => {
        if (req.method !== "POST") { res.statusCode = 405; res.end(); return; }
        killChild();
        res.statusCode = 200;
        res.end("stopped");
      });
      server.middlewares.use("/__chat", (req, res) => {
        if (req.method !== "POST") { res.statusCode = 405; res.end(); return; }
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", async () => {
          res.statusCode = 200;
          res.setHeader("content-type", "application/x-ndjson");
          res.setHeader("cache-control", "no-cache");
          const write = (obj: unknown) => res.write(JSON.stringify(obj) + "\n");
          try {
            const { message, selection, scope } = JSON.parse(body) as {
              message: string;
              selection?: { slideId?: string; elementId?: string };
              scope?: "slide" | "deck";
            };
            const ctx = selection?.elementId
              ? ` (the user currently has element "${selection.elementId}" on slide "${selection.slideId}" selected; "this"/"it" likely refers to it)`
              : selection?.slideId
                ? ` (the user is currently viewing slide "${selection.slideId}")`
                : "";
            const scopeNote = scope === "slide" && selection?.slideId
              ? ` Only modify the slide with id "${selection.slideId}".`
              : "";
            // First turn carries the deck-aware preamble; later turns are raw messages (warm
            // process already knows the deck file and keeps conversation context).
            const prompt = (turns === 0 ? `${preamble(deckRel)}\n\n` : "") + `User${ctx}:${scopeNote} ${message}`;

            const final = await ask(prompt, (e) => write(e));
            write({ type: "done", reply: final });
            res.end();
          } catch (err) {
            const msg = String((err as Error)?.message ?? err);
            write({
              type: "error",
              error: msg.includes("ENOENT")
                ? "`claude` CLI not found on PATH. Start `remotion-deck dev` from a shell where `claude` works."
                : msg,
            });
            res.end();
          }
        });
      });
    },
  };
};
