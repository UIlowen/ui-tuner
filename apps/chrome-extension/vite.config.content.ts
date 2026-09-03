import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Content script. Chrome MV3 content scripts cannot be ES modules, so this is
// built as a self-contained IIFE with a fixed output name referenced by
// manifest.json.
//
// The tailwindcss plugin is required here (not just in the sidepanel build):
// src/content/card/card.css is imported with `?inline` and must reach the
// bundle as COMPILED Tailwind output (preflight + :host-scoped tokens), not
// the raw `@import "tailwindcss"` source.
export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: false,
    target: "esnext",
    rollupOptions: {
      input: "src/content/index.ts",
      output: {
        format: "iife",
        entryFileNames: "content.js",
      },
    },
  },
});
