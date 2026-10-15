/**
 * Builds the web client if dist/ is missing or older than its sources. Used by start-web.bat,
 * start-app.bat and `npm run start`, so a fresh checkout or a `git pull` just works.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const stamp = path.join(root, "dist", "client", "index.html");
const sources = ["src/client", "src/shared", "vite.config.ts", "package.json"];

function newestMtime(target: string): number {
  const stat = fs.statSync(target, { throwIfNoEntry: false });
  if (!stat) return 0;
  if (!stat.isDirectory()) return stat.mtimeMs;
  let newest = stat.mtimeMs;
  for (const entry of fs.readdirSync(target))
    newest = Math.max(newest, newestMtime(path.join(target, entry)));
  return newest;
}

const built = fs.statSync(stamp, { throwIfNoEntry: false })?.mtimeMs ?? 0;
const changed = Math.max(...sources.map((s) => newestMtime(path.join(root, s))));

if (built >= changed) {
  console.log("✦ Web client is up to date.");
} else {
  console.log(
    built
      ? "✦ Sources changed. Rebuilding the web client…"
      : "✦ Building the web client (first run)…",
  );
  execSync("npx vite build", { cwd: root, stdio: "inherit" });
}
