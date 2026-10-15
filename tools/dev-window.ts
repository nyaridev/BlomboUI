/**
 * `npm run dev:app`: opens the desktop window on the Vite dev server (hot reload) once it's up.
 * Closing the window ends the dev session. Like start-app, the window keeps its data in
 * runtime/app/ rather than AppData.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PORTS } from "../src/shared/constants.ts";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const exe = path.join(
  root,
  "src-tauri",
  "target",
  "release",
  process.platform === "win32" ? "blombo-ui.exe" : "blombo-ui",
);
const url = `http://127.0.0.1:${PORTS.devWeb}`;

const deadline = Date.now() + 60_000;
for (;;) {
  try {
    if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) break;
  } catch {
    // not up yet
  }
  if (Date.now() > deadline) {
    console.error(`Timed out waiting for ${url}`);
    process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
}

const child = spawn(exe, ["--url", url, "--data-dir", path.join(root, "runtime", "app")], {
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 0));
