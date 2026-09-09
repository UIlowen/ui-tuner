import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Side Panel React app. Runs first in the build chain and is the only build
// allowed to empty dist/ — content and background builds append to it.
// Exception: dev.mjs runs all three as concurrent watchers and sets
// UI_TUNER_WATCH=1 — emptying there would delete content.js/background.js
// until their own (unchanged) inputs next trigger a rebuild.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: process.env.UI_TUNER_WATCH !== "1",
    rollupOptions: {
      input: { sidepanel: "sidepanel.html" },
    },
  },
});
