import { defineConfig } from "vite";

// Content script. Chrome MV3 content scripts cannot be ES modules, so this is
// built as a self-contained IIFE with a fixed output name referenced by
// manifest.json.
export default defineConfig({
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
