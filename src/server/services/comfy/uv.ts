/**
 * uv, shared by the slot installer and the custom node installer: where it lives
 * (runtime/tools/uv/, downloaded once on Windows), the environment that keeps its Python and
 * cache inside runtime/tools/, and `uv pip install` with progress read from its output.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { unzip } from "fflate";
import { stripAnsi } from "../../lib/ansi.ts";
import { exists, writeFileAtomic } from "../../lib/fsx.ts";
import type { InstallOps, RunOptions } from "./installer.ts";

const UV_WINDOWS_ZIP =
  "https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip";

export function toolsDir(runtimeDir: string): string {
  return path.join(runtimeDir, "tools");
}

/** Environment for uv and the Pythons it manages: everything stays in runtime/tools/. */
export function uvEnv(runtimeDir: string): NodeJS.ProcessEnv {
  const tools = toolsDir(runtimeDir);
  return {
    ...process.env,
    UV_PYTHON_INSTALL_DIR: path.join(tools, "python"),
    UV_CACHE_DIR: path.join(tools, "uv-cache"),
    UV_PYTHON_PREFERENCE: "only-managed",
    // Keep the downloaded Python private: no Windows registry entries, no python.exe shims.
    UV_PYTHON_INSTALL_REGISTRY: "0",
    UV_PYTHON_INSTALL_BIN: "0",
    UV_LINK_MODE: "copy",
    UV_NO_PROGRESS: "1",
    NO_COLOR: "1",
    PYTHONIOENCODING: "utf-8",
    VIRTUAL_ENV: "",
  };
}

/** uv in runtime/tools/uv (downloaded once on Windows), or from PATH elsewhere. */
export async function ensureUv(
  runtimeDir: string,
  ops: InstallOps,
  signal: AbortSignal,
  onProgress: (f: number | null) => void,
): Promise<string> {
  if (ops.platform !== "win32") return "uv";
  const dir = path.join(toolsDir(runtimeDir), "uv");
  const exe = path.join(dir, "uv.exe");
  if (await exists(exe)) return exe;
  const zip = path.join(toolsDir(runtimeDir), "downloads", "uv.zip");
  await ops.download(UV_WINDOWS_ZIP, zip, onProgress, signal);
  await extractFiles(zip, dir, (name) => /(^|\/)uvx?\.exe$/i.test(name));
  await fs.rm(zip, { force: true });
  if (!(await exists(exe))) throw new Error("The uv download didn't contain uv.exe.");
  return exe;
}

/**
 * `uv pip …`, with a rough 0–0.95 progress from its "Downloading" / "Downloaded" lines and the
 * latest line as the detail. Throws with the exit code when it fails.
 */
export async function runPip(
  ops: InstallOps,
  uv: string,
  args: string[],
  opts: RunOptions,
  onProgress: (progress: number | null, detail: string) => void,
): Promise<void> {
  let downloading = 0;
  let downloaded = 0;
  const code = await ops.run(uv, args, {
    ...opts,
    onLine: (raw) => {
      const line = stripAnsi(raw);
      opts.onLine(line);
      if (/^\s*Downloading\s/.test(line)) downloading++;
      if (/^\s*Downloaded\s/.test(line)) downloaded++;
      onProgress(downloading ? Math.min(0.95, downloaded / downloading) : null, line.trim());
    },
  });
  if (code !== 0) throw new Error(`Installing packages failed (exit code ${code}). See the log.`);
}

/* ── zip helpers ──────────────────────────────────────────────────────────── */

function unzipAsync(data: Uint8Array, filter: (name: string) => boolean) {
  return new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(data, { filter: (f) => filter(f.name) }, (err, files) =>
      err ? reject(err) : resolve(files),
    );
  });
}

/** Extract chosen files flat into `dest`. */
async function extractFiles(
  zip: string,
  dest: string,
  pick: (name: string) => boolean,
): Promise<void> {
  const files = await unzipAsync(new Uint8Array(await fs.readFile(zip)), pick);
  for (const [name, data] of Object.entries(files))
    if (!name.endsWith("/")) await writeFileAtomic(path.join(dest, path.basename(name)), data);
}

/** Extract a GitHub source zip ("ComfyUI-0.3.60/…") with its top folder stripped. */
export async function extractTopFolder(zip: string, dest: string): Promise<void> {
  const files = await unzipAsync(new Uint8Array(await fs.readFile(zip)), () => true);
  for (const [name, data] of Object.entries(files)) {
    const parts = name.split("/").slice(1);
    if (!parts.length || name.endsWith("/") || parts.some((p) => p === ".." || p === "")) continue;
    await fs.mkdir(path.join(dest, ...parts.slice(0, -1)), { recursive: true });
    await fs.writeFile(path.join(dest, ...parts), data);
  }
}
