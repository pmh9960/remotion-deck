import ReactDOM from "react-dom/client";
import { SlideDeck } from "remotion-deck";
import { DECK, SLIDES } from "./deck";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <SlideDeck slides={SLIDES} config={DECK} />,
);
