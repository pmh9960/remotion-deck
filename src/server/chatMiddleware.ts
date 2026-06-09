import type { Plugin } from "vite";

const SYSTEM = `You edit a presentation deck stored as JSON (the "remotion-deck" schema).
You receive the current deck and an instruction. Apply the instruction and return ONLY the full
updated deck JSON — no prose, no markdown fences.

Schema: { config?: { fps, width, height, theme? }, slides: [ { id, durationInFrames, background?,
elements: [ { id, type:"text"|"image"|"shape", x, y, w, h, text?|src?|shape?, style?, animation? } ] } ] }.
Positions are pixels in a 1920x1080 space. style: fontSize, fontWeight, color, align, lineHeight,
letterSpacing, uppercase, gradientText, background, borderRadius. animation.preset is one of
none|fade|rise|slide-left|slide-up|pop|typewriter with a "start" frame. Keep ids stable when possible.`;

/** POST /__chat { message, deck } → calls the Claude API to edit the deck, returns { deck } or { error }. */
export const chatMiddleware = (): Plugin => ({
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
          const { message, deck } = JSON.parse(body) as { message: string; deck: unknown };
          const key = process.env.ANTHROPIC_API_KEY;
          if (!key) {
            send({ error: "Set ANTHROPIC_API_KEY in the shell that runs `remotion-deck dev`, then restart, to use chat." });
            return;
          }
          const model = process.env.REMOTION_DECK_MODEL || "claude-sonnet-4-6";
          const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({
              model,
              max_tokens: 16000,
              system: SYSTEM,
              messages: [{ role: "user", content: `Current deck JSON:\n${JSON.stringify(deck)}\n\nInstruction: ${message}` }],
            }),
          });
          const data = (await apiRes.json()) as { content?: { text?: string }[]; error?: { message?: string } };
          if (!apiRes.ok) {
            send({ error: data?.error?.message ?? `Claude API error ${apiRes.status}` });
            return;
          }
          const text = (data.content ?? []).map((c) => c.text ?? "").join("");
          const start = text.indexOf("{");
          const end = text.lastIndexOf("}");
          if (start === -1 || end === -1) {
            send({ error: "Claude did not return deck JSON." });
            return;
          }
          send({ deck: JSON.parse(text.slice(start, end + 1)) });
        } catch (err) {
          send({ error: String(err) });
        }
      });
    });
  },
});
