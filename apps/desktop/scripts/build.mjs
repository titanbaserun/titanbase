import { build } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await build({ configFile: resolve(root, "vite.main.config.ts") });
await build({ configFile: resolve(root, "vite.preload.config.ts") });
await build({ configFile: resolve(root, "vite.renderer.config.ts") });
