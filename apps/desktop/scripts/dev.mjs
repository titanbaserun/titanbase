import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import electron from "electron";
import { build, createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await build({ configFile: resolve(root, "vite.main.config.ts"), mode: "development" });
await build({ configFile: resolve(root, "vite.preload.config.ts"), mode: "development" });

const server = await createServer({ configFile: resolve(root, "vite.renderer.config.ts"), mode: "development" });
await server.listen();
server.printUrls();
const rendererUrl = server.resolvedUrls?.local[0];
if (!rendererUrl) throw new Error("Vite did not expose a local renderer URL.");

const child = spawn(electron, [root], { cwd: root, env: { ...process.env, ELECTRON_RENDERER_URL: rendererUrl }, stdio: "inherit" });
let closing = false;
const close = async (signal = "SIGTERM") => {
  if (closing) return;
  closing = true;
  if (!child.killed) child.kill(signal);
  await server.close();
};
process.once("SIGINT", () => { void close("SIGINT"); });
process.once("SIGTERM", () => { void close("SIGTERM"); });
child.once("exit", async (code) => { await close(); process.exitCode = code ?? 0; });
