import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { DeckConfig, SlideDef } from "../src";

export const DECK: Partial<DeckConfig> = { fps: 30, width: 1920, height: 1080 };

const Title = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14, mass: 0.7 } });
  const op = interpolate(frame, [20, 45], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lineW = interpolate(frame, [18, 50], [0, 320], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: "radial-gradient(1200px 600px at 20% 10%, #11141d, #0b0d12)", padding: 140, justifyContent: "center", color: "#f5f6fa", fontFamily: "Segoe UI, system-ui, sans-serif" }}>
      <div style={{ fontSize: 24, letterSpacing: "0.3em", textTransform: "uppercase", color: "#6366f1", opacity: op }}>remotion-deck</div>
      <div style={{ fontSize: 96, fontWeight: 800, lineHeight: 1.05, marginTop: 24, opacity: interpolate(s, [0, 1], [0, 1]), transform: `translateY(${interpolate(s, [0, 1], [60, 0])}px)` }}>
        Presentation slides,<br />built with Remotion
      </div>
      <div style={{ height: 6, width: lineW, marginTop: 40, borderRadius: 99, background: "linear-gradient(90deg, #6366f1, #ec4899)" }} />
    </AbsoluteFill>
  );
};

const Bullets = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const head = spring({ frame, fps, config: { damping: 16 } });
  const points = ["Present with a single <SlideDeck slides={…} />", "Navigate with ← / → keys and click", "Export to PDF via renderDeckToPdf", "Tracks Remotion versions automatically (peerDeps)"];
  return (
    <AbsoluteFill style={{ background: "#0b0d12", padding: 140, justifyContent: "center", color: "#f5f6fa", fontFamily: "Segoe UI, system-ui, sans-serif" }}>
      <div style={{ fontSize: 64, fontWeight: 800, opacity: head, transform: `translateX(${interpolate(head, [0, 1], [-40, 0])}px)` }}>Features</div>
      <div style={{ marginTop: 64, display: "flex", flexDirection: "column", gap: 36 }}>
        {points.map((p, i) => {
          const s = spring({ frame: frame - (20 + i * 16), fps, config: { damping: 18 } });
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 28, fontSize: 40, opacity: s, transform: `translateY(${interpolate(s, [0, 1], [30, 0])}px)` }}>
              <span style={{ width: 18, height: 18, borderRadius: 99, background: "linear-gradient(135deg, #6366f1, #ec4899)" }} />
              <span>{p}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export const SLIDES: SlideDef[] = [
  { id: "title", component: Title, durationInFrames: 90 },
  { id: "features", component: Bullets, durationInFrames: 120 },
];
