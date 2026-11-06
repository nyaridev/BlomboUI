/**
 * `npm run dev:server`: runs the API server (`src/server/main.ts` with the flags given here) and
 * restarts it when a .ts or .json file under src/server or src/shared changes.
 *
 * Replaces `node --watch-path`: with NTFS last-access updates on, merely reading files (git, an
 * indexer, a grep) fires fs.watch "change" events, and node --watch restarted on every burst. Here
 * a restart needs a file whose mtime or size changed, or that appeared or went away.
 * Restarts ask the server to stop over IPC, so it saves and closes like on Ctrl+C.
 */
import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const dirs = ["src/server", "src/shared"].map((dir) => path.join(root, dir));
const watched = /\.(ts|json)$/;
const args = process.argv.slice(2);

function stamp(file: string): string | null {
  try {
    const stat = fs.statSync(file);
    return stat.isFile() ? `${stat.mtimeMs}:${stat.size}` : null;
  } catch {
    return null;
  }
}

const stamps = new Map<string, string>();
for (const dir of dirs)
  for (const rel of fs.readdirSync(dir, { recursive: true, encoding: "utf8" })) {
    const file = path.join(dir, rel);
    const s = watched.test(file) ? stamp(file) : null;
    if (s) stamps.set(file, s);
  }

let child: ChildProcess | null = null;
let restarting = false;
let quitting = false;

function start(): void {
  const proc = spawn(process.execPath, [path.join("src", "server", "main.ts"), ...args], {
    cwd: root,
    stdio: ["inherit", "inherit", "inherit", "ipc"],
  });
  child = proc;
  proc.on("exit", (code, signal) => {
    child = null;
    if (quitting) process.exit(0);
    if (restarting) {
      restarting = false;
      start();
    } else console.log(`[dev] Server exited (${signal ?? `code ${code}`}). Waiting for a change.`);
  });
}

function stop(proc: ChildProcess): void {
  if (proc.connected) proc.send("shutdown");
  else proc.kill();
  // The server gives itself 8 s to close; past that, end it.
  const force = setTimeout(() => proc.kill(), 10_000);
  proc.once("exit", () => clearTimeout(force));
}

const pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;

function checkPending(): void {
  const changed: string[] = [];
  for (const file of pending) {
    const s = stamp(file);
    if (s === (stamps.get(file) ?? null)) continue;
    changed.push(path.relative(root, file));
    if (s) stamps.set(file, s);
    else stamps.delete(file);
  }
  pending.clear();
  if (!changed.length || quitting) return;
  const more = changed.length > 1 ? ` and ${changed.length - 1} more` : "";
  console.log(`[dev] ${changed[0]}${more} changed. Restarting the server.`);
  if (!child) start();
  else if (!restarting) {
    restarting = true;
    stop(child);
  }
}

for (const dir of dirs)
  fs.watch(dir, { recursive: true }, (_event, name) => {
    if (!name || !watched.test(name)) return;
    pending.add(path.join(dir, name));
    clearTimeout(timer);
    timer = setTimeout(checkPending, 200);
  });

function quit(): void {
  if (quitting) return;
  quitting = true;
  if (child) stop(child);
  else process.exit(0);
}
process.on("SIGINT", quit);
process.on("SIGTERM", quit);

start();
