/**
 * Installs a managed ComfyUI slot from inside the app (runtime/comfyui/<slot>/), with progress
 * on the live bus instead of console prompts. Windows first.
 *
 *   tools         uv (Astral's Python package manager), kept in runtime/tools/uv/
 *   python        a private Python 3.12 venv in the slot (uv downloads a standalone Python into
 *                 runtime/tools/python/, so nothing touches the system Python)
 *   comfyui       the ComfyUI release zip from GitHub, unpacked into <slot>/ComfyUI/
 *   torch         PyTorch for NVIDIA GPUs (CUDA 12.8) or CPU only
 *   requirements  ComfyUI's requirements.txt
 *   verify        import torch in the new Python and write blombo/slot.json
 *
 * Every step skips work that's already done, so after a failure or a cancel "Install" resumes.
 * While installing, <slot>/blombo/installing marks the slot unfinished and the supervisor won't
 * start it. Network and process access go through `InstallOps` so tests run without either.
 */
import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { unzip } from "fflate";
import {
  type InstallBody,
  type InstallState,
  type InstallStepId,
  idleInstall,
  type TorchVariant,
} from "../../../shared/install.ts";
import { stripAnsi } from "../../lib/ansi.ts";
import { Emitter } from "../../lib/emitter.ts";
import { exists, writeFileAtomic, writeJsonAtomic } from "../../lib/fsx.ts";
import { HttpError } from "../../lib/http.ts";
import { slotsRoot } from "./slots.ts";

const MAX_LOG = 200;
const PYTHON_VERSION = "3.12";
const UV_WINDOWS_ZIP =
  "https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip";
const TORCH_INDEX: Record<TorchVariant, string> = {
  cuda: "https://download.pytorch.org/whl/cu128",
  cpu: "https://download.pytorch.org/whl/cpu",
};

export interface RunOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  signal: AbortSignal;
  onLine: (line: string) => void;
}

export interface InstallOps {
  /** Download to `dest`, reporting 0–1 when the size is known. */
  download(
    url: string,
    dest: string,
    onProgress: (fraction: number | null) => void,
    signal: AbortSignal,
  ): Promise<void>;
  /** Run a program; resolves with its exit code. */
  run(command: string, args: string[], opts: RunOptions): Promise<number>;
  /** The ComfyUI release to install: its tag and source zip URL. */
  release(version: string, signal: AbortSignal): Promise<{ tag: string; zip: string }>;
  platform: NodeJS.Platform;
}

type InstallerEvents = {
  state: (state: InstallState) => void;
  installed: (slot: string) => void;
};

class Cancelled extends Error {}

export class ComfyInstaller extends Emitter<InstallerEvents> {
  private readonly runtimeDir: string;
  private readonly ops: InstallOps;
  private current: InstallState = idleInstall();
  private abort: AbortController | null = null;
  private lastEmit = 0;
  private emitTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(runtimeDir: string, ops: InstallOps = defaultOps()) {
    super();
    this.runtimeDir = runtimeDir;
    this.ops = ops;
  }

  state(): InstallState {
    return this.current;
  }

  get running(): boolean {
    return this.current.state === "running";
  }

  private toolsDir(): string {
    return path.join(this.runtimeDir, "tools");
  }

  /** Start installing; resolves once it has started (progress comes as events). */
  async start(body: Required<InstallBody>): Promise<void> {
    if (this.running) throw new HttpError(409, "ComfyUI is already being installed.", "busy");
    const slotDir = path.join(slotsRoot(this.runtimeDir), body.slot);
    const unfinished = await exists(path.join(slotDir, "blombo", "installing"));
    if (!unfinished && (await exists(path.join(slotDir, "ComfyUI", "main.py"))))
      throw new HttpError(
        409,
        `Slot "${body.slot}" is already installed. Pick another name to install a second copy.`,
        "exists",
      );
    if (this.running) throw new HttpError(409, "ComfyUI is already being installed.", "busy");
    const abort = new AbortController();
    this.abort = abort;
    this.current = {
      ...idleInstall(),
      state: "running",
      slot: body.slot,
      torch: body.torch,
      startedAt: Date.now(),
    };
    this.emitNow();
    void this.install(body, abort.signal);
  }

  cancel(): void {
    this.abort?.abort();
  }

  /* ── state ───────────────────────────────────────────────────────────── */

  private emitNow(): void {
    if (this.emitTimer) clearTimeout(this.emitTimer);
    this.emitTimer = null;
    this.lastEmit = Date.now();
    this.emit("state", this.current);
  }

  /** Progress ticks are throttled; step changes go out at once. */
  private emitSoon(): void {
    if (this.emitTimer) return;
    const wait = Math.max(0, 200 - (Date.now() - this.lastEmit));
    this.emitTimer = setTimeout(() => this.emitNow(), wait);
  }

  private step(id: InstallStepId, patch: Partial<InstallState["steps"][number]>, now = true): void {
    this.current = {
      ...this.current,
      steps: this.current.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    };
    if (now) this.emitNow();
    else this.emitSoon();
  }

  private log(line: string): void {
    const text = stripAnsi(line).trimEnd();
    if (!text.trim()) return;
    const log = [...this.current.log, text];
    this.current = { ...this.current, log: log.slice(-MAX_LOG) };
    this.emitSoon();
  }

  /* ── steps ───────────────────────────────────────────────────────────── */

  private async install(body: Required<InstallBody>, signal: AbortSignal): Promise<void> {
    const slotDir = path.join(slotsRoot(this.runtimeDir), body.slot);
    const marker = path.join(slotDir, "blombo", "installing");
    const comfyDir = path.join(slotDir, "ComfyUI");
    let active: InstallStepId | null = null;
    const run = async (id: InstallStepId, fn: () => Promise<string | null>) => {
      if (signal.aborted) throw new Cancelled();
      active = id;
      this.step(id, { state: "active", progress: null, detail: null });
      const skipped = await fn();
      this.step(id, { state: skipped ? "skipped" : "done", progress: 1, detail: skipped });
    };
    try {
      await writeFileAtomic(marker, new Date().toISOString());

      let uv = "";
      await run("tools", async () => {
        uv = await this.ensureUv(signal, (f) => this.step("tools", { progress: f }, false));
        return null;
      });

      const python = this.venvPython(slotDir);
      await run("python", async () => {
        if (await exists(python)) return "Already set up";
        const code = await this.ops.run(
          uv,
          ["venv", "--python", PYTHON_VERSION, path.join(slotDir, ".venv")],
          this.runOpts(slotDir, signal),
        );
        if (code !== 0) throw new Error(`Setting up Python failed (exit code ${code}).`);
        return null;
      });

      await run("comfyui", async () => {
        if (await exists(path.join(comfyDir, "main.py"))) return "Already downloaded";
        const release = await this.ops.release(body.version, signal);
        this.current = { ...this.current, version: release.tag };
        this.step("comfyui", { detail: `ComfyUI ${release.tag}` });
        const zip = path.join(this.toolsDir(), "downloads", `comfyui-${release.tag}.zip`);
        await this.ops.download(
          release.zip,
          zip,
          (f) => this.step("comfyui", { progress: f === null ? null : f * 0.8 }, false),
          signal,
        );
        await extractTopFolder(zip, comfyDir);
        await fs.rm(zip, { force: true });
        if (!(await exists(path.join(comfyDir, "main.py"))))
          throw new Error("The ComfyUI download didn't contain main.py.");
        return null;
      });

      await run("torch", async () => {
        const args = ["pip", "install", "--python", python, "torch", "torchvision", "torchaudio"];
        args.push("--index-url", TORCH_INDEX[body.torch]);
        await this.pip(uv, args, slotDir, "torch", signal);
        return null;
      });

      await run("requirements", async () => {
        const req = path.join(comfyDir, "requirements.txt");
        if (!(await exists(req))) return "No requirements.txt";
        await this.pip(
          uv,
          ["pip", "install", "--python", python, "-r", req],
          slotDir,
          "requirements",
          signal,
        );
        return null;
      });

      await run("verify", async () => {
        let out = "";
        const code = await this.ops.run(
          python,
          ["-c", "import torch; print(torch.__version__, torch.cuda.is_available())"],
          {
            ...this.runOpts(slotDir, signal),
            onLine: (l) => {
              out = l;
              this.log(l);
            },
          },
        );
        if (code !== 0) throw new Error("PyTorch didn't load in the new Python. See the log.");
        const [torch, cuda] = out.trim().split(/\s+/);
        if (body.torch === "cuda" && cuda !== "True")
          this.log("Note: PyTorch can't see an NVIDIA GPU. ComfyUI will run on the CPU (slow).");
        await writeJsonAtomic(path.join(slotDir, "blombo", "slot.json"), {
          comfyui: this.current.version,
          torch: torch ?? null,
          variant: body.torch,
          installedAt: new Date().toISOString(),
        });
        await fs.rm(marker, { force: true });
        return null;
      });

      this.current = { ...this.current, state: "done", finishedAt: Date.now() };
      this.emitNow();
      this.emit("installed", body.slot);
    } catch (error) {
      const cancelled = signal.aborted || error instanceof Cancelled;
      if (active) this.step(active, { state: cancelled ? "pending" : "error" }, false);
      this.current = {
        ...this.current,
        state: cancelled ? "cancelled" : "error",
        finishedAt: Date.now(),
        error: cancelled
          ? "Install stopped. Install again to continue where it left off."
          : `${error instanceof Error ? error.message : String(error)} Check your internet connection and install again; finished steps are kept.`,
      };
      this.emitNow();
    } finally {
      this.abort = null;
    }
  }

  private runOpts(slotDir: string, signal: AbortSignal): RunOptions {
    const tools = this.toolsDir();
    return {
      cwd: slotDir,
      signal,
      onLine: (l) => this.log(l),
      env: {
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
      },
    };
  }

  private async pip(
    uv: string,
    args: string[],
    slotDir: string,
    id: InstallStepId,
    signal: AbortSignal,
  ): Promise<void> {
    let downloading = 0;
    let downloaded = 0;
    const opts = this.runOpts(slotDir, signal);
    const code = await this.ops.run(uv, args, {
      ...opts,
      onLine: (raw) => {
        const line = stripAnsi(raw);
        opts.onLine(line);
        if (/^\s*Downloading\s/.test(line)) downloading++;
        if (/^\s*Downloaded\s/.test(line)) downloaded++;
        const progress = downloading ? Math.min(0.95, downloaded / downloading) : null;
        this.step(id, { progress, detail: line.trim().slice(0, 120) }, false);
      },
    });
    if (code !== 0) throw new Error(`Installing packages failed (exit code ${code}). See the log.`);
  }

  private venvPython(slotDir: string): string {
    return this.ops.platform === "win32"
      ? path.join(slotDir, ".venv", "Scripts", "python.exe")
      : path.join(slotDir, ".venv", "bin", "python");
  }

  /** uv in runtime/tools/uv (downloaded once on Windows), or from PATH elsewhere. */
  private async ensureUv(
    signal: AbortSignal,
    onProgress: (f: number | null) => void,
  ): Promise<string> {
    if (this.ops.platform !== "win32") return "uv";
    const dir = path.join(this.toolsDir(), "uv");
    const exe = path.join(dir, "uv.exe");
    if (await exists(exe)) return exe;
    const zip = path.join(this.toolsDir(), "downloads", "uv.zip");
    await this.ops.download(UV_WINDOWS_ZIP, zip, onProgress, signal);
    await extractFiles(zip, dir, (name) => /(^|\/)uvx?\.exe$/i.test(name));
    await fs.rm(zip, { force: true });
    if (!(await exists(exe))) throw new Error("The uv download didn't contain uv.exe.");
    return exe;
  }
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

/* ── real network and processes ───────────────────────────────────────────── */

export function defaultOps(): InstallOps {
  return {
    platform: process.platform,
    async download(url, dest, onProgress, signal) {
      const res = await fetch(url, { signal, redirect: "follow" });
      if (!res.ok || !res.body)
        throw new Error(`Download failed (${res.status}) from ${new URL(url).host}.`);
      const total = Number(res.headers.get("content-length")) || 0;
      await fs.mkdir(path.dirname(dest), { recursive: true });
      const tmp = `${dest}.part`;
      const handle = await fs.open(tmp, "w");
      let got = 0;
      try {
        for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
          await handle.write(chunk);
          got += chunk.byteLength;
          onProgress(total ? got / total : null);
        }
      } finally {
        await handle.close();
      }
      await fs.rm(dest, { force: true });
      await fs.rename(tmp, dest);
    },
    run(command, args, opts) {
      return new Promise((resolve, reject) => {
        let child: ChildProcess;
        try {
          child = spawn(command, args, { cwd: opts.cwd, env: opts.env, windowsHide: true });
        } catch (error) {
          reject(error);
          return;
        }
        const kill = () => {
          if (process.platform === "win32" && child.pid)
            spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
          else child.kill();
        };
        opts.signal.addEventListener("abort", kill, { once: true });
        const lines = (stream: NodeJS.ReadableStream | null) => {
          if (!stream) return;
          let rest = "";
          stream.setEncoding("utf8");
          stream.on("data", (chunk: string) => {
            const parts = (rest + chunk).split(/\r?\n|\r(?!\n)/);
            rest = parts.pop() ?? "";
            for (const p of parts) opts.onLine(p);
          });
          stream.on("end", () => rest && opts.onLine(rest));
        };
        lines(child.stdout);
        lines(child.stderr);
        child.on("error", (error) =>
          reject(new Error(`Couldn't run ${path.basename(command)}: ${error.message}`)),
        );
        child.on("close", (code) => {
          opts.signal.removeEventListener("abort", kill);
          if (opts.signal.aborted) reject(new Cancelled());
          else resolve(code ?? 1);
        });
      });
    },
    async release(version, signal) {
      const api =
        version === "latest"
          ? "https://api.github.com/repos/comfyanonymous/ComfyUI/releases/latest"
          : `https://api.github.com/repos/comfyanonymous/ComfyUI/releases/tags/${encodeURIComponent(version)}`;
      const res = await fetch(api, {
        signal,
        headers: { accept: "application/vnd.github+json", "user-agent": "BlomboUI" },
      });
      if (!res.ok)
        throw new Error(
          res.status === 404
            ? `ComfyUI release "${version}" wasn't found on GitHub.`
            : `GitHub didn't answer (${res.status}).`,
        );
      const body = (await res.json()) as { tag_name?: string };
      const tag = body.tag_name;
      if (!tag) throw new Error("GitHub's release answer had no tag.");
      return {
        tag,
        zip: `https://github.com/comfyanonymous/ComfyUI/archive/refs/tags/${encodeURIComponent(tag)}.zip`,
      };
    },
  };
}
