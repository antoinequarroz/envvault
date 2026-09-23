import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App, { type CommandBridge, type Tab } from "./App";
import "./styles.css";

async function render() {
  let preview: { command?: CommandBridge; initialTab?: Tab } = {};
  if (import.meta.env.DEV) {
    preview = (await import("./preview")).previewFromLocation();
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode><App {...preview} /></StrictMode>,
  );
}

void render();
