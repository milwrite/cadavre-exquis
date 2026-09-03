// Copy the two play surfaces, the wall, and their assets into dist/ for Workers Static Assets.
// The Worker serves ui/config.local.js itself, so it is never copied.
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const dist = fileURLToPath(new URL("../dist/", import.meta.url));

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "ui"), { recursive: true });
cpSync(join(root, "index.html"), join(dist, "index.html"));
cpSync(join(root, "wall.html"), join(dist, "wall.html"));
cpSync(join(root, "assets"), join(dist, "assets"), { recursive: true });
cpSync(join(root, "ui", "corpse.html"), join(dist, "ui", "corpse.html"));
console.log("dist/ rebuilt: index.html, wall.html, assets/, ui/corpse.html");
