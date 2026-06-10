#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();

const usage = () => {
  console.log(`remotion-deck <command>

  dev       Open the visual editor (edits save to deck.json)
  present   Play the deck full-screen
  pdf       Render deck.json to presentation.pdf
  doctor    Tidy the deck: align edges, snap to grid, trim whitespace
  init      Scaffold a new deck (deck.json + package.json)

Options:
  --deck <path>     deck JSON file (default: deck.json)
  --out <path>      output PDF path (default: presentation.pdf)
  --open            (dev/present) open a browser tab automatically
  --dry             (doctor) preview fixes without writing
`);
};

const getFlag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};

const loadDeck = (deckPath: string) => {
  if (!fs.existsSync(deckPath)) {
    console.error(`remotion-deck: ${path.relative(cwd, deckPath)} not found`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(deckPath, "utf8"));
};

const cmdPdf = async () => {
  const deckPath = path.resolve(cwd, getFlag("deck") ?? "deck.json");
  const out = path.resolve(cwd, getFlag("out") ?? "presentation.pdf");
  const deck = loadDeck(deckPath);

  // Write a temporary Remotion entry INSIDE the project so that "remotion-deck"
  // resolves from the project's node_modules. The deck JSON is embedded as a
  // literal to avoid any import-path resolution for the data file.
  const tmpDir = path.join(cwd, ".remotion-deck");
  fs.mkdirSync(tmpDir, { recursive: true });
  const entry = path.join(tmpDir, "entry.tsx");
  fs.writeFileSync(
    entry,
    `import { registerDeck, deckFromJson } from "remotion-deck";\n` +
      `const deck = ${JSON.stringify(deck)};\n` +
      `const { slides, config } = deckFromJson(deck);\n` +
      `registerDeck(slides, config);\n`,
  );

  try {
    const { renderDeckToPdf } = await import("./node.js");
    const result = await renderDeckToPdf({
      entryPoint: entry,
      output: out,
      onProgress: ({ id, index, total }: { id: string; index: number; total: number }) =>
        console.log(`  ${index + 1}/${total} ${id}`),
    });
    console.log(`✓ wrote ${path.relative(cwd, result.output)} (${result.pages} pages)`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
};

const cmdServe = async (mode: "editor" | "present") => {
  const deckFile = path.resolve(cwd, getFlag("deck") ?? "deck.json");
  if (!fs.existsSync(deckFile)) {
    console.error(`remotion-deck: ${path.relative(cwd, deckFile)} not found`);
    process.exit(1);
  }
  const port = Number(getFlag("port")) || 5173;
  const open = process.argv.includes("--open");
  const { createDevServer } = await import("./server/createDevServer.js");
  await createDevServer({ cwd, deckFile, mode, port, open });
  // Keep the process alive; the Vite server runs until Ctrl+C.
};

const cmdDoctor = async () => {
  const deckPath = path.resolve(cwd, getFlag("deck") ?? "deck.json");
  const deck = loadDeck(deckPath);
  const { doctorDeck } = await import("./doctor.js");
  const { deck: fixed, changes } = doctorDeck(deck);
  if (changes.length === 0) {
    console.log("✓ deck is already tidy");
    return;
  }
  changes.forEach((c) => console.log(`  · ${c}`));
  if (process.argv.includes("--dry")) {
    console.log(`(dry run) ${changes.length} fixes not written — drop --dry to apply`);
    return;
  }
  fs.writeFileSync(deckPath, JSON.stringify(fixed, null, 2) + "\n");
  console.log(`✓ applied ${changes.length} fixes to ${path.relative(cwd, deckPath)}`);
};

const STARTER_DECK = {
  config: { fps: 30, width: 1920, height: 1080 },
  slides: [
    {
      id: "title",
      durationInFrames: 90,
      background: { type: "radial", from: "#11141d", to: "#0b0d12", at: "18% 0%" },
      elements: [
        { id: "eyebrow", type: "text", x: 140, y: 470, w: 1500, h: 40, text: "My talk", style: { fontSize: 26, fontWeight: 700, letterSpacing: "0.28em", color: "#6366f1", uppercase: true }, animation: { preset: "fade", start: 18 } },
        { id: "title", type: "text", x: 140, y: 520, w: 1620, h: 200, text: "Your title here", style: { fontSize: 96, fontWeight: 800 }, animation: { preset: "rise", start: 0 } },
        { id: "rule", type: "shape", shape: "pill", x: 140, y: 740, w: 340, h: 6, animation: { preset: "slide-left", start: 16 } },
      ],
    },
    {
      id: "point",
      durationInFrames: 120,
      elements: [
        { id: "h", type: "text", x: 140, y: 340, w: 1640, h: 90, text: "A point", style: { fontSize: 60, fontWeight: 800 }, animation: { preset: "rise", start: 0 } },
        { id: "b1", type: "text", x: 140, y: 480, w: 1640, h: 50, text: "•   First idea", style: { fontSize: 38 }, animation: { preset: "rise", start: 14 } },
        { id: "b2", type: "text", x: 140, y: 550, w: 1640, h: 50, text: "•   Second idea", style: { fontSize: 38 }, animation: { preset: "rise", start: 22 } },
      ],
    },
  ],
};

const STARTER_PKG = {
  name: "my-deck",
  private: true,
  type: "module",
  scripts: { dev: "remotion-deck dev", present: "remotion-deck present", pdf: "remotion-deck pdf", doctor: "remotion-deck doctor" },
  dependencies: {
    "@remotion/bundler": "^4.0.0",
    "@remotion/player": "^4.0.0",
    "@remotion/renderer": "^4.0.0",
    react: "^18.3.1",
    "react-dom": "^18.3.1",
    remotion: "^4.0.0",
    "remotion-deck": "^0.1.0",
  },
};

const cmdInit = () => {
  const deckPath = path.join(cwd, "deck.json");
  if (fs.existsSync(deckPath)) {
    console.error("remotion-deck: deck.json already exists here");
    process.exit(1);
  }
  fs.writeFileSync(deckPath, JSON.stringify(STARTER_DECK, null, 2) + "\n");
  const pkgPath = path.join(cwd, "package.json");
  if (!fs.existsSync(pkgPath)) {
    const pkg = { ...STARTER_PKG, name: path.basename(cwd) || "deck" };
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    console.log("✓ created deck.json + package.json\n  next: npm install  →  npx remotion-deck dev");
  } else {
    console.log("✓ created deck.json\n  next: npx remotion-deck dev");
  }
};

const main = async () => {
  const command = process.argv[2];
  switch (command) {
    case "pdf":
      await cmdPdf();
      break;
    case "dev":
      await cmdServe("editor");
      break;
    case "present":
      await cmdServe("present");
      break;
    case "doctor":
      await cmdDoctor();
      break;
    case "init":
      cmdInit();
      break;
    case undefined:
    case "-h":
    case "--help":
      usage();
      break;
    default:
      console.error(`remotion-deck: unknown command "${command}"`);
      usage();
      process.exit(1);
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
