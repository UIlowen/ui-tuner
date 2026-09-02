import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initPrefs } from "./prefs-binding";
import "../styles/sidepanel.css";

// Theme class + stored locale/theme before first paint.
initPrefs();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
