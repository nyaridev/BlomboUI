/**
 * Builds the Tauri desktop window (src-tauri) when the binary is missing or older than its
 * sources. Needs the Rust toolchain (https://rustup.rs); the first build takes a few minutes.
 */
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const exe = path.join(
  root,
  "src-tauri",
  "target",
  "release",
  process.platform === "win32" ? "blombo-ui.exe" : "blombo-ui",
);
const sources = [
  "src-tauri/src",
  "src-tauri/Cargo.toml",
  "src-tauri/tauri.conf.json",
  "src-tauri/build.rs",
  "src-tauri/capabilities",
  "src-tauri/icons",
];

function newestMtime(target: string): number {
  const stat = fs.statSync(target, { throwIfNoEntry: false });
  if (!stat) return 0;
  if (!stat.isDirectory()) return stat.mtimeMs;
  return Math.max(
    stat.mtimeMs,
    ...fs.readdirSync(target).map((e) => newestMtime(path.join(target, e))),
  );
}

const built = fs.statSync(exe, { throwIfNoEntry: false })?.mtimeMs ?? 0;
const changed = Math.max(...sources.map((s) => newestMtime(path.join(root, s))));

if (built >= changed) {
  console.log("✦ Desktop app is up to date.");
  process.exit(0);
}

const cargo = spawnSync("cargo --version", { encoding: "utf8", shell: true });
if (cargo.status !== 0) {
  console.error(`
✖ The desktop app needs the Rust toolchain to build (one time).
  1. Install Rust from https://rustup.rs (default options)
  2. On Windows also install "Desktop development with C++" (Visual Studio Build Tools)
  3. Run start-app.bat again.
  Meanwhile, start-web.bat runs BlomboUI in your browser.
`);
  process.exit(1);
}

console.log(
  built
    ? "✦ Desktop app sources changed. Rebuilding…"
    : "✦ Building the desktop app (first run takes a few minutes)…",
);
execSync("npx tauri build --no-bundle", { cwd: root, stdio: "inherit" });
