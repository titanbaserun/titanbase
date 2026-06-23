import { builtinModules } from "node:module";

export const electronExternals = ["electron", ...builtinModules, ...builtinModules.map((name) => `node:${name}`)];
