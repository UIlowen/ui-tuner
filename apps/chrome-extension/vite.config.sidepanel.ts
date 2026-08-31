import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Side Panel React app. Runs first in the build chain and is the only build
// allowed to empty dist/ — content and background builds append to it.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: { sidepanel: "sidepanel.html" },
    },
  },
});
