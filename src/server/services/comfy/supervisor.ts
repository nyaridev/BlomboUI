/**
 * The ComfyUI supervisor: one per server. It follows the active profile's ComfyUI target —
 * a managed slot it starts and stops, or an external URL it only connects to — owns the single
 * ComfyClient for that target, keeps recent log lines, and reports a ComfyStatus.
 *
 * Managed slots get `--extra-model-paths-config` from the profile's models folder and
 * `--output-directory` from its outputs folder. In dev mode a managed ComfyUI keeps running when
 * the server restarts (node --watch) and is re-adopted from its pid file, so editing server code
 * doesn't reload every model.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { z } from "zod";
import type { ComfyLogLine, ComfyStatus } from "../../../shared/comfy.ts";
import { PORTS } from "../../../shared/constants.ts";
import type { Profile } from "../../../shared/profile.ts";
import { NodeDef, type ObjectInfo } from "../../../shared/workflow/graph.ts";
import { stripAnsi } from "../../lib/ansi.ts";
import { Emitter } from "../../lib/emitter.ts";
import { writeFileAtomic, writeJsonAtomic } from "../../lib/fsx.ts";
import { ComfyClient, type ComfyPreview, type ComfyWsMessage } from "./client.ts";
import { extraModelPathsYaml } from "./paths.ts";
import { findSlot, type SlotLayout } from "./slots.ts";

export type ComfyTarget =
  | { mode: "managed"; slot: string; models: string; outputs: string }
  | { mode: "external"; url: string };

export interface LaunchSpec {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

export interface SupervisorOptions {
  runtimeDir: string;
  /** Leave a managed ComfyUI running on shutdown and re-adopt it next start. */
  keepAlive: boolean;
  /** How long a managed start may take before giving up (first starts import custom nodes). */
  readyTimeoutMs?: number;
  /** Tests swap the Python command for a fake server. */
  launch?: (layout: SlotLayout, args: string[]) => LaunchSpec;
  findSlot?: typeof findSlot;
  preferredPort?: number;
  /**
   * Runs before a managed slot starts (Blombo's own custom nodes go in here); returns a line for
   * the log, or null. A failure is logged and doesn't stop ComfyUI from starting.
   */
  prepareSlot?: (layout: SlotLayout) => Promise<string | null>;
}

type SupervisorEvents = {
  status: (status: ComfyStatus) => void;
  log: (lines: ComfyLogLine[]) => void;
  message: (msg: ComfyWsMessage) => void;
  preview: (preview: ComfyPreview) => void;
  /** The connection opened (fresh object_info may differ: custom nodes, new models). */
  connected: () => void;
};

const PidFile = z.object({ pid: z.number().int(), port: z.number().int(), startedAt: z.string() });

const MAX_LOG_LINES = 2000;

export function targetFromProfile(profile: Profile): ComfyTarget {
  return profile.comfy.mode === "external"
    ? { mode: "external", url: profile.comfy.url.replace(/\/+$/, "") }
    : {
        mode: "managed",
        slot: profile.comfy.slot,
        models: profile.paths.models,
        outputs: profile.paths.outputs,
      };
}

function sameTarget(a: ComfyTarget | null, b: ComfyTarget | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export class ComfySupervisor extends Emitter<SupervisorEvents> {
  readonly clientId = randomUUID();
  private readonly opts: SupervisorOptions;
  private target: ComfyTarget | null = null;
  /** Target the running managed process was started with. */
  private runningTarget: ComfyTarget | null = null;
  private client: ComfyClient | null = null;
  private unbind: Array<() => void> = [];
  private child: ChildProcess | null = null;
  private layout: SlotLayout | null = null;
  private port: number | null = null;
  private current: ComfyStatus;
  private readonly lines: ComfyLogLine[] = [];
  private pendingLines: ComfyLogLine[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private objectInfoCache: Promise<ObjectInfo> | null = null;
  private followingLogs = false;
  /** Bumped by every start/stop so a slow start can tell it was superseded. */
  private generation = 0;

  constructor(opts: SupervisorOptions) {
    super();
    this.opts = opts;
    this.current = {
      state: "stopped",
      mode: "managed",
      slot: null,
      url: `http://127.0.0.1:${PORTS.comfy}`,
      pid: null,
      startedAt: null,
      version: null,
      message: "Open a profile to start ComfyUI.",
      restartNeeded: false,
    };
  }

  status(): ComfyStatus {
    return this.current;
  }

  logs(): ComfyLogLine[] {
    return this.lines.slice();
  }

  /** The connected client, or null while ComfyUI isn't reachable. */
  get api(): ComfyClient | null {
    return this.client?.connected ? this.client : null;
  }

  get isRunning(): boolean {
    return this.current.state === "running" && Boolean(this.client?.connected);
  }

  /* ── target ─────────────────────────────────────────────────────────────── */

  /**
   * Follow a profile's ComfyUI settings. Managed slots start, external URLs connect.
   * `onChange: "flag"` (editing the open profile) marks a needed restart instead of restarting
   * under a running job; opening a profile restarts right away.
   */
  async applyProfile(profile: Profile, onChange: "restart" | "flag" = "restart"): Promise<void> {
    const next = targetFromProfile(profile);
    if (sameTarget(this.target, next) && this.current.state !== "stopped") {
      if (this.current.restartNeeded && sameTarget(this.runningTarget, next))
        this.setStatus({ restartNeeded: false });
      return;
    }
    const prev = this.target;
    this.target = next;

    if (next.mode === "external") {
      if (prev?.mode === "managed") await this.stopManaged();
      this.attachClient(next.url);
      this.setStatus({
        mode: "external",
        slot: null,
        url: next.url,
        pid: null,
        startedAt: null,
        state: this.client?.connected ? "running" : "starting",
        message: null,
        restartNeeded: false,
      });
      return;
    }

    // Managed: same slot and already running → only flag a restart when folders changed.
    if (
      prev?.mode === "managed" &&
      prev.slot === next.slot &&
      this.runningTarget &&
      (this.current.state === "running" || this.current.state === "starting")
    ) {
      const changed = !sameTarget(this.runningTarget, next);
      if (changed && onChange === "flag") this.setStatus({ restartNeeded: true });
      else if (changed) await this.restart();
      else this.setStatus({ restartNeeded: false });
      return;
    }
    if (prev?.mode === "managed") await this.stopManaged();
    if (prev?.mode === "external") {
      // Leaving an external ComfyUI: let go of it before starting the slot.
      this.dropClient();
      this.setStatus({ state: "stopped", pid: null, startedAt: null, version: null });
    }
    await this.start();
  }

  /* ── lifecycle ──────────────────────────────────────────────────────────── */

  async start(): Promise<ComfyStatus> {
    const target = this.target;
    if (!target) return this.current;
    if (target.mode === "external") {
      this.client?.reconnect();
      return this.current;
    }
    if (this.child || this.current.state === "running" || this.current.state === "starting")
      return this.current;

    const gen = ++this.generation;
    const lookup = await (this.opts.findSlot ?? findSlot)(this.opts.runtimeDir, target.slot);
    if (gen !== this.generation) return this.current;
    if (!lookup.ok) {
      this.setStatus({
        state: "missing",
        mode: "managed",
        slot: target.slot,
        pid: null,
        message: lookup.reason,
      });
      return this.current;
    }
    const layout = lookup.layout;
    this.layout = layout;
    if (this.opts.prepareSlot)
      try {
        const note = await this.opts.prepareSlot(layout);
        if (note) this.log("sys", note);
      } catch (error) {
        this.log(
          "sys",
          `Couldn't prepare the slot: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    if (gen !== this.generation) return this.current;

    if (await this.adopt(layout, target, gen)) return this.current;
    if (gen !== this.generation) return this.current;

    const port = await findFreePort(this.opts.preferredPort ?? PORTS.comfy);
    const url = `http://127.0.0.1:${port}`;
    const args = [
      "-s",
      layout.main,
      "--listen",
      "127.0.0.1",
      "--port",
      String(port),
      "--disable-auto-launch",
      "--preview-method",
      "auto",
    ];
    const yaml = extraModelPathsYaml(target.models);
    if (yaml) {
      const file = path.join(layout.stateDir, "extra_model_paths.yaml");
      await writeFileAtomic(file, yaml);
      args.push("--extra-model-paths-config", file);
    }
    if (target.outputs.trim()) args.push("--output-directory", target.outputs.trim());
    // A CPU-only PyTorch makes ComfyUI crash looking for CUDA unless it's told.
    if (layout.torch === "cpu") args.push("--cpu");

    const spec = this.opts.launch
      ? this.opts.launch(layout, args)
      : { command: layout.python, args, cwd: layout.comfyDir };

    this.log("sys", `Starting ComfyUI (slot ${layout.slot}) on ${url}`);
    this.setStatus({
      state: "starting",
      mode: "managed",
      slot: layout.slot,
      url,
      pid: null,
      startedAt: null,
      version: null,
      message: "Loading ComfyUI and its custom nodes…",
      restartNeeded: false,
    });

    let child: ChildProcess;
    try {
      child = spawn(spec.command, spec.args, {
        cwd: spec.cwd,
        env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8", ...spec.env },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      this.setStatus({ state: "crashed", message: `Couldn't start Python: ${String(error)}` });
      return this.current;
    }
    this.child = child;
    this.port = port;
    this.runningTarget = target;
    const startedAt = new Date().toISOString();
    this.setStatus({ pid: child.pid ?? null, startedAt });
    if (child.pid)
      await writeJsonAtomic(path.join(layout.stateDir, "comfy.pid"), {
        pid: child.pid,
        port,
        startedAt,
      }).catch(() => undefined);

    pipeLines(child.stdout, (text) => this.log("out", text));
    pipeLines(child.stderr, (text) => this.log("err", text));
    child.on("error", (error) => {
      this.log("sys", `Python failed to start: ${error.message}`);
    });
    child.on("exit", (code, signal) => {
      if (this.child !== child) return;
      this.child = null;
      this.runningTarget = null;
      void fs.rm(path.join(layout.stateDir, "comfy.pid"), { force: true });
      this.dropClient();
      const stopping = this.current.state === "stopping" || this.current.state === "restarting";
      this.log("sys", `ComfyUI exited (${signal ?? `code ${code ?? 0}`}).`);
      this.setStatus(
        stopping
          ? {
              state: this.current.state === "restarting" ? "restarting" : "stopped",
              pid: null,
              message:
                this.current.state === "restarting" ? "Restarting ComfyUI…" : "ComfyUI is stopped.",
            }
          : {
              state: "crashed",
              pid: null,
              message: `ComfyUI stopped unexpectedly (${signal ?? `exit code ${code}`}). Open the logs to see why, then restart it.`,
            },
      );
    });

    this.attachClient(url);
    void this.waitReady(url, gen);
    return this.current;
  }

  async stop(): Promise<ComfyStatus> {
    if (this.target?.mode === "external") return this.current;
    await this.stopManaged();
    return this.current;
  }

  async restart(): Promise<ComfyStatus> {
    if (this.target?.mode === "external") {
      this.client?.reconnect();
      return this.current;
    }
    this.setStatus({ state: "restarting", message: "Restarting ComfyUI…" });
    await this.stopManaged(true);
    return this.start();
  }

  /** Server shutdown: stop a managed ComfyUI unless it should outlive the server (dev). */
  async shutdown(): Promise<void> {
    this.client?.disconnect();
    if (this.opts.keepAlive || !this.current.pid) return;
    await this.stopManaged();
  }

  private async stopManaged(restarting = false): Promise<void> {
    this.generation++;
    const pid = this.child?.pid ?? this.current.pid;
    const child = this.child;
    if (!pid) {
      this.dropClient();
      if (!restarting) this.setStatus({ state: "stopped", message: "ComfyUI is stopped." });
      return;
    }
    if (!restarting) this.setStatus({ state: "stopping", message: "Stopping ComfyUI…" });
    this.log("sys", "Stopping ComfyUI");
    this.dropClient();
    await killTree(pid);
    if (child) await waitExit(child, 10_000);
    this.child = null;
    this.runningTarget = null;
    if (this.layout)
      await fs
        .rm(path.join(this.layout.stateDir, "comfy.pid"), { force: true })
        .catch(() => undefined);
    this.setStatus({
      state: restarting ? "restarting" : "stopped",
      pid: null,
      startedAt: null,
      message: restarting ? "Restarting ComfyUI…" : "ComfyUI is stopped.",
    });
  }

  /** Reattach to a ComfyUI this server started before it restarted (dev keep-alive). */
  private async adopt(layout: SlotLayout, target: ComfyTarget, gen: number): Promise<boolean> {
    let info: z.infer<typeof PidFile>;
    try {
      info = PidFile.parse(
        JSON.parse(await fs.readFile(path.join(layout.stateDir, "comfy.pid"), "utf8")),
      );
    } catch {
      return false;
    }
    const url = `http://127.0.0.1:${info.port}`;
    const alive = isAlive(info.pid) && (await answers(url));
    if (gen !== this.generation) return true;
    if (!alive) {
      await fs.rm(path.join(layout.stateDir, "comfy.pid"), { force: true }).catch(() => undefined);
      return false;
    }
    this.port = info.port;
    this.runningTarget = target;
    this.log(
      "sys",
      `Reattached to ComfyUI (pid ${info.pid}) on ${url}. Lines it printed before this are in ComfyUI's own log.`,
    );
    this.setStatus({
      state: "starting",
      mode: "managed",
      slot: layout.slot,
      url,
      pid: info.pid,
      startedAt: info.startedAt,
      message: null,
      restartNeeded: false,
    });
    this.attachClient(url);
    return true;
  }

  private async waitReady(url: string, gen: number): Promise<void> {
    const deadline = Date.now() + (this.opts.readyTimeoutMs ?? 5 * 60_000);
    while (Date.now() < deadline) {
      if (gen !== this.generation || !this.child) return;
      if (await answers(url)) {
        // Connect now instead of waiting out the socket's backoff; "open" flips us to running.
        if (!this.client?.connected) this.client?.reconnect();
        return;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (gen !== this.generation) return;
    this.log("sys", "ComfyUI didn't answer in time.");
    this.setStatus({
      message:
        "ComfyUI is taking unusually long to start. Check the logs; it may be stuck on a custom node.",
    });
  }

  /* ── client ─────────────────────────────────────────────────────────────── */

  private attachClient(url: string): void {
    if (this.client?.baseUrl === url.replace(/\/+$/, "")) {
      this.client.connect();
      return;
    }
    this.dropClient();
    const client = new ComfyClient(url, this.clientId);
    this.client = client;
    this.unbind = [
      client.on("open", () => void this.onOpen(client)),
      client.on("close", () => this.onClose(client)),
      client.on("message", (msg) => this.onMessage(msg)),
      client.on("preview", (p) => this.emit("preview", p)),
    ];
    client.connect();
  }

  private dropClient(): void {
    for (const off of this.unbind) off();
    this.unbind = [];
    this.client?.disconnect();
    this.client = null;
    this.objectInfoCache = null;
  }

  private async onOpen(client: ComfyClient): Promise<void> {
    this.objectInfoCache = null;
    let version: string | null = null;
    try {
      version = (await client.systemStats()).system?.comfyui_version ?? null;
    } catch {
      // Connected but stats failed: still usable.
    }
    if (this.client !== client) return;
    this.setStatus({ state: "running", version, message: null });
    this.log("sys", `Connected to ComfyUI${version ? ` ${version}` : ""} at ${client.baseUrl}`);
    if (this.followingLogs) void this.subscribeRemoteLogs(true);
    this.emit("connected");
  }

  private onClose(client: ComfyClient): void {
    if (this.client !== client) return;
    this.objectInfoCache = null;
    if (this.target?.mode === "external") {
      this.setStatus({
        state: "unreachable",
        message: `Can't reach ComfyUI at ${client.baseUrl}. Start it there; Blombo reconnects on its own.`,
      });
    } else if (this.current.state === "running" && !this.child) {
      // An adopted process went away.
      this.setStatus({ state: "stopped", pid: null, message: "ComfyUI is stopped." });
      this.dropClient();
    } else if (this.current.state === "running") {
      this.setStatus({
        state: "starting",
        message: "Lost the connection to ComfyUI. Reconnecting…",
      });
    }
  }

  private onMessage(msg: ComfyWsMessage): void {
    if (msg.type === "logs") {
      const entries = (msg.data.entries ?? []) as Array<{ t?: string; m?: string }>;
      for (const e of entries) if (e.m) this.log("out", e.m.replace(/\r?\n$/, ""));
      return;
    }
    this.emit("message", msg);
  }

  /** ComfyUI's node definitions, cached until the connection changes. */
  async objectInfo(): Promise<ObjectInfo | null> {
    const api = this.api;
    if (!api) return null;
    if (!this.objectInfoCache) {
      const request = api.objectInfo().then((raw) => {
        // Validate per node so one odd custom node can't hide the others.
        const out: ObjectInfo = {};
        for (const [name, def] of Object.entries((raw ?? {}) as Record<string, unknown>)) {
          const parsed = NodeDef.safeParse(def);
          if (parsed.success) out[name] = parsed.data;
        }
        return out;
      });
      this.objectInfoCache = request;
      request.catch(() => {
        if (this.objectInfoCache === request) this.objectInfoCache = null;
      });
    }
    try {
      return await this.objectInfoCache;
    } catch {
      return null;
    }
  }

  /**
   * Resolves true once ComfyUI is connected, false when it stops, crashes or takes longer than
   * `timeoutMs` (the custom node installer waits on this after a restart).
   */
  whenConnected(timeoutMs: number): Promise<boolean> {
    if (this.current.state === "running" && this.client) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => finish(false), timeoutMs);
      const offConnected = this.on("connected", () => finish(true));
      const offStatus = this.on("status", (s) => {
        if (s.state === "crashed" || s.state === "stopped" || s.state === "missing") finish(false);
      });
      function finish(ok: boolean) {
        clearTimeout(timer);
        offConnected();
        offStatus();
        resolve(ok);
      }
    });
  }

  /** Forget object_info so the next read picks up new models or nodes. */
  refreshObjectInfo(): void {
    this.objectInfoCache = null;
  }

  /* ── logs ───────────────────────────────────────────────────────────────── */

  /**
   * Stream logs while a log view is open. A process Blombo started is already piped; for an
   * external or reattached ComfyUI, ask ComfyUI to forward its terminal over the socket.
   */
  followLogs(on: boolean): void {
    if (this.followingLogs === on) return;
    this.followingLogs = on;
    if (!this.child) void this.subscribeRemoteLogs(on);
  }

  private async subscribeRemoteLogs(on: boolean): Promise<void> {
    const api = this.api;
    if (!api || this.child) return;
    try {
      if (on && this.lines.every((l) => l.stream === "sys")) {
        const raw = await api.request<{ entries?: Array<{ m?: string }> }>(
          "GET",
          "/internal/logs/raw",
        );
        for (const e of raw.entries ?? []) if (e.m) this.log("out", e.m.replace(/\r?\n$/, ""));
      }
      await api.request("PATCH", "/internal/logs/subscribe", {
        clientId: this.clientId,
        enabled: on,
      });
    } catch {
      if (on)
        this.log("sys", "This ComfyUI doesn't share its log; open its own window to read it.");
    }
  }

  private log(stream: ComfyLogLine["stream"], raw: string): void {
    const line: ComfyLogLine = { at: Date.now(), stream, text: stripAnsi(raw) };
    this.lines.push(line);
    if (this.lines.length > MAX_LOG_LINES) this.lines.splice(0, this.lines.length - MAX_LOG_LINES);
    // Batch lines: ComfyUI prints hundreds while importing nodes.
    this.pendingLines.push(line);
    if (!this.flushTimer)
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        const batch = this.pendingLines;
        this.pendingLines = [];
        this.emit("log", batch);
      }, 100);
  }

  private setStatus(patch: Partial<ComfyStatus>): void {
    const next = { ...this.current, ...patch };
    if (JSON.stringify(next) === JSON.stringify(this.current)) return;
    this.current = next;
    this.emit("status", next);
  }
}

/* ── process helpers ──────────────────────────────────────────────────────── */

function pipeLines(stream: NodeJS.ReadableStream | null, onLine: (text: string) => void): void {
  if (!stream) return;
  let rest = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    const parts = (rest + chunk).split(/\r?\n|\r(?!\n)/);
    rest = parts.pop() ?? "";
    for (const p of parts) if (p.trim()) onLine(p);
  });
  stream.on("end", () => {
    if (rest.trim()) onLine(rest);
  });
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function answers(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/system_stats`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Kill a process and its children (ComfyUI may spawn helpers). */
function killTree(pid: number): Promise<void> {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      const p = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
      p.on("exit", () => resolve());
      p.on("error", () => resolve());
    } else {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // already gone
      }
      resolve();
    }
  });
}

function waitExit(child: ChildProcess, ms: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    child.once("exit", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

/** First port from `start` that nothing on 127.0.0.1 is listening on. */
export async function findFreePort(start: number, attempts = 50): Promise<number> {
  for (let port = start; port < start + attempts; port++) {
    const free = await new Promise<boolean>((resolve) => {
      const srv = net.createServer();
      srv.once("error", () => resolve(false));
      srv.listen(port, "127.0.0.1", () => srv.close(() => resolve(true)));
    });
    if (free) return port;
  }
  throw new Error(`No free port between ${start} and ${start + attempts}.`);
}
