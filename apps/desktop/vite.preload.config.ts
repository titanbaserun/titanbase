import { resolve } from "node:path";
import { defineConfig } from "vite";
import { electronExternals } from "./vite.shared";

export default defineConfig({
  build: {
    target: "node24",
    outDir: "out/preload",
    emptyOutDir: true,
    lib: { entry: resolve(__dirname, "electron/preload.ts"), formats: ["cjs"], fileName: () => "preload.js" },
    rollupOptions: { external: electronExternals },
  },
});
