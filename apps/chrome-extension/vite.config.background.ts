import { defineConfig } from "vite";

// Background service worker. Manifest declares "type": "module", so this stays
// a single self-contained ES file with a fixed output name.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    target: "esnext",
    rollupOptions: {
      input: "src/background/index.ts",
      output: {
        format: "es",
        entryFileNames: "background.js",
      },
    },
  },
});
