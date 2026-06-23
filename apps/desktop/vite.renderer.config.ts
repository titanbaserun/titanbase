import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(__dirname, "src"),
  publicDir: resolve(__dirname, "../web/public"),
  plugins: [react({ exclude: [/\/node_modules\//, /\/packages\/[^/]+\/dist\//] })],
  server: { hmr: false },
  build: {
    outDir: resolve(__dirname, "out/renderer"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: { input: resolve(__dirname, "src/index.html") },
  },
});
