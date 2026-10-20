/**
 * Installs the custom node packs a stage needs (Impact Pack, Impact Subpack, controlnet_aux…)
 * into the active profile's managed slot, so a stage's "Needs custom nodes" offers Install the
 * way a missing model offers the Manager.
 *
 *   download:<folder>   the pack's GitHub source zip at the commit its stage package pins,
 *                       unpacked in <slot>/blombo/tmp/ and moved into ComfyUI/custom_nodes/
 *   stop                ComfyUI, when it's running: Windows locks loaded .pyd files, so pip
 *                       can't replace a package a running ComfyUI has imported
 *   packages:<folder>   the pack's requirements.txt with uv into the slot's Python, with the
 *                       installed torch builds as constraints so a pack can't swap CUDA for CPU
 *   restart / verify    start ComfyUI again and check its object_info has the pack's nodes
 *
 * Only packs a stage package lists with a pinned commit can be installed; the page names them
 * by repository URL and never sends a URL of its own. A pack folder that's already there
 * (installed by hand or by ComfyUI-Manager) is kept and only gets its requirements, which is
 * also how a pack whose import failed for a missing package gets fixed. An external ComfyUI
 * is the user's: Blombo says what to install there and changes nothing.
 *
 * Network and processes go through `InstallOps` (as in the slot installer), ComfyUI through
 * `NodePackComfy`, so tests run the whole flow with fakes.
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  InstalledPacks,
  idleNodeInstall,
  type NodeInstallState,
  type NodeInstallStep,
} from "../../../shared/install.ts";
import type { ObjectInfo } from "../../../shared/workflow/graph.ts";
import type { NodePack } from "../../../shared/workflow/stages.ts";
import { stripAnsi } from "../../lib/ansi.ts";
import { Emitter } from "../../lib/emitter.ts";
import { exists, movePath, readJsonFile, writeFileAtomic, writeJsonAtomic } from "../../lib/fsx.ts";
import { HttpError } from "../../lib/http.ts";
import { defaultOps, type InstallOps, type RunOptions } from "./installer.ts";
import { findSlot } from "./slots.ts";
import { ensureUv, extractTopFolder, runPip, toolsDir, uvEnv } from "./uv.ts";

const MAX_LOG = 200;
/** First starts import every custom node (and some download helpers): give them time. */
const START_TIMEOUT_MS = 5 * 60_000;
/** Packages the slot installer chose for the GPU; a pack's requirements must not replace them. */
const PINNED = new Set(["torch", "torchvision", "torchaudio"]);

/** What the installer needs from ComfyUI (the supervisor in the app, a fake in tests). */
export interface NodePackComfy {
  /** The active profile's ComfyUI: a managed slot, an external URL, or none yet. */
  target(): { mode: "managed"; slot: string } | { mode: "external"; url: string } | null;
  running(): boolean;
  stop(): Promise<void>;
  /** Start ComfyUI and wait until it answers; false when it didn't come up. */
  startAndWait(timeoutMs: number): Promise<boolean>;
  /** Fresh node definitions (cache dropped first). */
  objectInfo(): Promise<ObjectInfo | null>;
}

export interface NodePackDeps {
  runtimeDir: string;
  comfy: NodePackComfy;
  /** The packs stage packages list (the only ones that can be installed). */
  known(): Promise<NodePack[]>;
  /** Why installing can't start now (jobs running, the slot being installed), or null. */
  blocked(): string | null;
  ops?: InstallOps;
}

type NodePackEvents = {
  state: (state: NodeInstallState) => void;
  /** Packs landed in a slot (ComfyUI may still need a start to load them). */
  installed: (slot: string) => void;
};

interface Planned {
  pack: NodePack & { ref: string };
  folder: string;
  /** Set once the folder is in custom_nodes/. */
  dir: string | null;
}

class Cancelled extends Error {}

/** The folder name ComfyUI-Manager would use: the repository's name. */
export function packFolder(pack: NodePack): string {
  return pack.folder ?? new URL(pack.url).pathname.split("/").filter(Boolean).pop() ?? "pack";
}

/** Manager installs from its registry use lower-case ids ("comfyui-impact-pack"). */
const sameFolder = (a: string, b: string) =>
  a.toLowerCase().replace(/_/g, "-") === b.toLowerCase().replace(/_/g, "-");

/** What to tell someone whose ComfyUI Blombo doesn't manage. */
export function externalHowTo(packs: NodePack[]): string {
  const names = packs.map((p) => p.name).join(", ");
  return `This profile uses a ComfyUI you run yourself, so Blombo doesn't add custom nodes to it. Install ${names} there (ComfyUI-Manager → Custom Nodes Manager, or git clone into custom_nodes), restart that ComfyUI, then check again.`;
}

export class NodePackInstaller extends Emitter<NodePackEvents> {
  private readonly deps: NodePackDeps;
  private readonly ops: InstallOps;
  private current: NodeInstallState = idleNodeInstall();
  private abort: AbortController | null = null;
  private lastEmit = 0;
  private emitTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(deps: NodePackDeps) {
    super();
    this.deps = deps;
    this.ops = deps.ops ?? defaultOps();
  }

  state(): NodeInstallState {
    return this.current;
  }

  get running(): boolean {
    return this.current.state === "running";
  }

  /** Start installing these packs (repository URLs); progress comes as events. */
  async start(urls: string[]): Promise<void> {
    if (this.running) throw new HttpError(409, "Custom nodes are already being installed.", "busy");
    const known = await this.deps.known();
    const packs: Planned[] = [];
    for (const url of new Set(urls)) {
      const pack = known.find((p) => p.url === url);
      if (!pack?.ref)
        throw new HttpError(
          400,
          "Blombo can only install the custom nodes its stages list. Install other packs inside ComfyUI.",
          "unknown_pack",
        );
      packs.push({ pack: { ...pack, ref: pack.ref }, folder: packFolder(pack), dir: null });
    }
    const target = this.deps.comfy.target();
    if (!target) throw new HttpError(409, "Open a profile first.", "no_profile");
    if (target.mode === "external")
      throw new HttpError(409, externalHowTo(packs.map((p) => p.pack)), "external");
    const blocked = this.deps.blocked();
    if (blocked) throw new HttpError(409, blocked, "blocked");
    const lookup = await findSlot(this.deps.runtimeDir, target.slot);
    if (!lookup.ok) throw new HttpError(409, lookup.reason, "no_slot");
    if (this.running) throw new HttpError(409, "Custom nodes are already being installed.", "busy");

    const wasRunning = this.deps.comfy.running();
    const steps: NodeInstallStep[] = [
      ...packs.map((p) => step(`download:${p.folder}`, `Download ${p.pack.name}`)),
      ...(wasRunning ? [step("stop", "Stop ComfyUI")] : []),
      ...packs.map((p) => step(`packages:${p.folder}`, `Install ${p.pack.name}'s packages`)),
      ...(wasRunning
        ? [step("restart", "Start ComfyUI again"), step("verify", "Check the nodes loaded")]
        : []),
    ];
    const abort = new AbortController();
    this.abort = abort;
    this.current = {
      ...idleNodeInstall(),
      state: "running",
      slot: target.slot,
      packs: packs.map((p) => p.pack.url),
      steps,
      startedAt: Date.now(),
    };
    this.emitNow();
    void this.install(
      target.slot,
      lookup.layout.dir,
      lookup.layout.comfyDir,
      lookup.layout.python,
      packs,
      wasRunning,
      abort.signal,
    );
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

  private emitSoon(): void {
    if (this.emitTimer) return;
    const wait = Math.max(0, 200 - (Date.now() - this.lastEmit));
    this.emitTimer = setTimeout(() => this.emitNow(), wait);
  }

  private step(id: string, patch: Partial<NodeInstallStep>, now = true): void {
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
    this.current = { ...this.current, log: [...this.current.log, text].slice(-MAX_LOG) };
    this.emitSoon();
  }

  /* ── steps ───────────────────────────────────────────────────────────── */

  private async install(
    slot: string,
    slotDir: string,
    comfyDir: string,
    python: string,
    packs: Planned[],
    wasRunning: boolean,
    signal: AbortSignal,
  ): Promise<void> {
    const comfy = this.deps.comfy;
    const customNodes = path.join(comfyDir, "custom_nodes");
    // Set inside the step callbacks; an object so TypeScript doesn't narrow them to null.
    const at: { active: string | null; stopped: boolean } = { active: null, stopped: false };
    const run = async (id: string, fn: () => Promise<string | null>) => {
      if (signal.aborted) throw new Cancelled();
      at.active = id;
      this.step(id, { state: "active", progress: null, detail: null });
      const skipped = await fn();
      this.step(id, { state: skipped ? "skipped" : "done", progress: 1, detail: skipped });
      at.active = null;
    };
    // The profile may switch to another slot meanwhile: only touch ComfyUI if it's still ours.
    const stillOurs = () => {
      const t = comfy.target();
      return t?.mode === "managed" && t.slot === slot;
    };
    try {
      for (const p of packs)
        await run(`download:${p.folder}`, async () => {
          const found = await findPackDir(customNodes, p.folder);
          if (found) {
            p.dir = found;
            return "Already in custom_nodes";
          }
          p.dir = await this.download(p, slotDir, customNodes, signal);
          return null;
        });

      if (wasRunning)
        await run("stop", async () => {
          if (!comfy.running() || !stillOurs()) return "Not running";
          await comfy.stop();
          at.stopped = true;
          return null;
        });

      let uv = "";
      let constraints: string | null | undefined;
      for (const p of packs)
        await run(`packages:${p.folder}`, async () => {
          const req = path.join(p.dir as string, "requirements.txt");
          if (!(await exists(req))) return "No requirements.txt";
          uv ||= await ensureUv(this.deps.runtimeDir, this.ops, signal, (f) =>
            this.step(`packages:${p.folder}`, { progress: f, detail: "Getting uv" }, false),
          );
          if (constraints === undefined)
            constraints = await this.pinTorch(uv, python, slotDir, signal);
          const args = ["pip", "install", "--python", python, "-r", req];
          if (constraints) args.push("-c", constraints);
          await runPip(this.ops, uv, args, this.runOpts(slotDir, signal), (progress, detail) =>
            this.step(`packages:${p.folder}`, { progress, detail: detail.slice(0, 120) }, false),
          );
          return null;
        });
      this.emit("installed", slot);

      let note: string | null = null;
      if (wasRunning) {
        let up = false;
        await run("restart", async () => {
          if (!stillOurs()) return "The profile uses another ComfyUI now";
          up = await comfy.startAndWait(START_TIMEOUT_MS);
          at.stopped = false;
          if (!up)
            throw new Error(
              "ComfyUI didn't start again. Open its log from the status menu to see why.",
            );
          return null;
        });
        await run("verify", async () => {
          if (!up) return "ComfyUI isn't running";
          const info = await comfy.objectInfo();
          if (!info) return "ComfyUI isn't running";
          const failed = packs.filter((p) => p.pack.nodes.some((n) => !info[n]));
          if (failed.length)
            throw new Error(
              `ComfyUI didn't load ${failed.map((p) => p.pack.name).join(", ")}. Open ComfyUI's log from the status menu to see why (often a package that failed to install), then install again.`,
            );
          return null;
        });
      } else {
        note = "ComfyUI loads them the next time it starts.";
      }

      this.current = { ...this.current, state: "done", note, finishedAt: Date.now() };
      this.emitNow();
    } catch (error) {
      const cancelled = signal.aborted || error instanceof Cancelled;
      if (at.active) this.step(at.active, { state: cancelled ? "pending" : "error" }, false);
      const message = error instanceof Error ? error.message : String(error);
      this.current = {
        ...this.current,
        state: cancelled ? "cancelled" : "error",
        finishedAt: Date.now(),
        error: cancelled
          ? "Install stopped. Install again to continue; downloaded packs are kept."
          : at.active?.startsWith("download:")
            ? `${message} Check your internet connection and install again.`
            : message,
      };
      this.emitNow();
    } finally {
      this.abort = null;
      // Never leave ComfyUI stopped because of a failed or cancelled install.
      if (at.stopped && stillOurs())
        void comfy.startAndWait(START_TIMEOUT_MS).catch(() => undefined);
    }
  }

  private runOpts(slotDir: string, signal: AbortSignal): RunOptions {
    return { cwd: slotDir, signal, onLine: (l) => this.log(l), env: uvEnv(this.deps.runtimeDir) };
  }

  /** The source zip at the pinned commit → custom_nodes/<folder>. Returns the folder. */
  private async download(
    p: Planned,
    slotDir: string,
    customNodes: string,
    signal: AbortSignal,
  ): Promise<string> {
    const id = `download:${p.folder}`;
    const zip = path.join(
      toolsDir(this.deps.runtimeDir),
      "downloads",
      `${p.folder}-${p.pack.ref.slice(0, 12)}.zip`,
    );
    await this.ops.download(
      `${p.pack.url}/archive/${p.pack.ref}.zip`,
      zip,
      (f) => this.step(id, { progress: f === null ? null : f * 0.9 }, false),
      signal,
    );
    // Unpack beside the slot, then move in whole: ComfyUI never sees half a pack.
    const tmp = path.join(slotDir, "blombo", "tmp", p.folder);
    await fs.rm(tmp, { recursive: true, force: true });
    await extractTopFolder(zip, tmp);
    await fs.rm(zip, { force: true });
    if (!(await exists(path.join(tmp, "__init__.py"))))
      throw new Error(`The ${p.pack.name} download isn't a ComfyUI custom node (no __init__.py).`);
    const dest = path.join(customNodes, p.folder);
    await movePath(tmp, dest);
    const record = path.join(slotDir, "blombo", "packs.json");
    // A damaged record only loses Blombo's notes, never the packs: start it over.
    const installed: InstalledPacks = await readJsonFile(record, InstalledPacks, {}).catch(
      () => ({}),
    );
    installed[p.folder] = {
      url: p.pack.url,
      ref: p.pack.ref,
      installedAt: new Date().toISOString(),
    };
    await writeJsonAtomic(record, installed);
    this.log(`${p.pack.name} ${p.pack.ref.slice(0, 7)} → custom_nodes/${p.folder}`);
    return dest;
  }

  /**
   * A constraints file holding torch, torchvision and torchaudio at the versions in the slot,
   * so uv refuses a pack that would replace them instead of quietly installing a CPU build.
   * Null when they can't be read (a hand-made slot): the install goes on without it.
   */
  private async pinTorch(
    uv: string,
    python: string,
    slotDir: string,
    signal: AbortSignal,
  ): Promise<string | null> {
    const lines: string[] = [];
    const code = await this.ops
      .run(uv, ["pip", "freeze", "--python", python], {
        ...this.runOpts(slotDir, signal),
        onLine: (l) => lines.push(l.trim()),
      })
      .catch(() => 1);
    if (code !== 0) return null;
    const pins = lines.filter((l) => PINNED.has(l.split("==")[0]?.toLowerCase() ?? ""));
    if (!pins.length) return null;
    const file = path.join(slotDir, "blombo", "constraints.txt");
    await writeFileAtomic(file, `${pins.join("\n")}\n`);
    return file;
  }
}

function step(id: string, label: string): NodeInstallStep {
  return { id, label, state: "pending", progress: null, detail: null };
}

/** An existing pack folder in custom_nodes/ (any spelling ComfyUI-Manager uses), or null. */
async function findPackDir(customNodes: string, folder: string): Promise<string | null> {
  let entries: string[] = [];
  try {
    entries = (await fs.readdir(customNodes, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return null;
  }
  const name = entries.find((e) => sameFolder(e, folder));
  return name ? path.join(customNodes, name) : null;
}
