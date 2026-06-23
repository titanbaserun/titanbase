import { resolve } from "node:path";
import { defineConfig } from "vite";
import { electronExternals } from "./vite.shared";

export default defineConfig({
  build: {
    target: "node24",
    outDir: "out/main",
    emptyOutDir: true,
    lib: { entry: resolve(__dirname, "electron/main.ts"), formats: ["cjs"], fileName: () => "main.js" },
    rollupOptions: { external: electronExternals },
  },
});
