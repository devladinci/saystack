import "@saystack/react-web/styles.css";
import "./app.css";

import { setVoiceRecorder } from "@saystack/core";
import { createWebRecorder } from "@saystack/web";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";

setVoiceRecorder(createWebRecorder());

const root = document.getElementById("root");

if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
