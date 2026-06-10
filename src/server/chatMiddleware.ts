import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Plugin } from "vite";

const INSTRUCTIONS = `You are editing a presentation deck stored as JSON (the "remotion-deck" schema).
Apply the user's instruction to the deck and respond with ONLY the full updated deck JSON — no prose,
no markdown fences, and do not use any tools. Schema: { config?, slides:[{ id, durationInFrames,
background?, elements:[{ id, type:"text"|"image"|"shape", x, y, w, h, text?|src?|shape?, style?,
animation? }] }] }. Positions are pixels in a 1920x1080 space. style keys: fontSize, fontWeight,
color, align, lineHeight, letterSpacing, uppercase, gradientText, background, borderRadius.
animation.preset: none|fade|rise|slide-left|slide-up|pop|typewriter with a "start" frame. Keep ids stable.`;

/**
 * POST /__chat { message, deck, selection? } → drives the user's own Claude Code via `claude -p`,
 * keeping ONE persistent session for the life of the dev server (so follow-ups have context).
 * Uses the user's existing Claude Code auth — no separate API key needed.
 */
export const chatMiddleware = (): Plugin => {
  let sessionId: string | null = null;

  const runClaude = (prompt: string) =>
    new Promise<string>((resolve, reject) => {
      const args = ["-p", "--output-format", "json"];
      const resuming = Boolean(sessionId);
      if (sessionId) args.push("--resume", sessionId);
      else {
        sessionId = randomUUID();
        args.push("--session-id", sessionId);
      }
      const child = spawn("claude", args, { shell: true, env: process.env });
      let out = "";
      let err = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("claude timed out"));
      }, 180000);
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err += d));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve(out);
        } else {
          if (resuming) sessionId = null; // session may have expired; start fresh next time
          reject(new Error(err.trim() || `claude exited with code ${code}`));
        }
      });
      child.stdin.write(prompt);
      child.stdin.end();
    });

  return {
    name: "remotion-deck:chat-api",
    configureServer(server) {
      server.middlewares.use("/__chat", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", async () => {
          const send = (obj: unknown) => {
            res.statusCode = 200;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify(obj));
          };
          try {
            const { message, deck, selection } = JSON.parse(body) as {
              message: string;
              deck: unknown;
              selection?: { slideId?: string; elementId?: string };
            };
            const ctx = selection?.elementId
              ? `\nThe user currently has element "${selection.elementId}" on slide "${selection.slideId}" selected; "this"/"it" likely refers to it.`
              : selection?.slideId
                ? `\nThe user is currently viewing slide "${selection.slideId}".`
                : "";
            const prompt = `${INSTRUCTIONS}\n\nCurrent deck JSON:\n${JSON.stringify(deck)}${ctx}\n\nInstruction: ${message}`;

            const raw = await runClaude(prompt);
            let text = raw;
            try {
              const parsed = JSON.parse(raw) as { result?: string };
              if (typeof parsed.result === "string") text = parsed.result;
            } catch {
              /* not JSON envelope — treat as raw text */
            }
            const start = text.indexOf("{");
            const end = text.lastIndexOf("}");
            if (start === -1 || end === -1) {
              send({ error: "Claude did not return deck JSON." });
              return;
            }
            send({ deck: JSON.parse(text.slice(start, end + 1)) });
          } catch (err) {
            const msg = String((err as Error)?.message ?? err);
            send({
              error: msg.includes("ENOENT")
                ? "`claude` CLI not found on PATH. Install Claude Code and start `remotion-deck dev` from a shell where `claude` works."
                : msg,
            });
          }
        });
      });
    },
  };
};
