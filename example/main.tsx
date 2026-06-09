import ReactDOM from "react-dom/client";
// In a real consumer: import { SlideDeck } from "remotion-deck";
import { SlideDeck } from "../src";
import { DECK, SLIDES } from "./deck";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <SlideDeck slides={SLIDES} config={DECK} />,
);
