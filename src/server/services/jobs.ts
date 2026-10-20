/**
 * The server-side job queue. Clicking Generate queues runs here; one run at a time is compiled
 * (so wildcards and seeds are fresh) and sent to ComfyUI. ComfyUI's socket events for it become
 * progress, preview frames and images on the live bus. Because the queue is on the server it
 * survives page reloads and every open window sees the same thing.
 */
import { randomUUID } from "node:crypto";
import type { ComfyStatus } from "../../shared/comfy.ts";
import {
  type GenerateBody,
  type GenerateResponse,
  type Job,
  type JobImage,
  JobImage as JobImageSchema,
  type QueueSnapshot,
} from "../../shared/jobs.ts";
import { encodePreviewFrame, type LiveTopic, type ServerMessage } from "../../shared/live.ts";
import { randomSeed } from "../../shared/random.ts";
import { nodeInputs } from "../../shared/workflow/graph.ts";
import {
  bindingFor,
  type SeedMode,
  type WorkflowManifest,
} from "../../shared/workflow/manifest.ts";
import { hiresSize, readStages } from "../../shared/workflow/stages.ts";
import { HttpError } from "../lib/http.ts";
import { ComfyHttpError, type ComfyPreview, type ComfyWsMessage } from "./comfy/client.ts";
import type { ComfySupervisor } from "./comfy/supervisor.ts";
import type { ProfileService } from "./profiles.ts";
import type { StageService } from "./stages.ts";
import { loadWildcards } from "./wildcards.ts";
import { CompileError, compile } from "./workflows/compile.ts";
import { LORA_LOADER } from "./workflows/nodes.ts";
import type { WorkflowService } from "./workflows/store.ts";

export interface QueueDeps {
  supervisor: ComfySupervisor;
  workflows: WorkflowService;
  profiles: ProfileService;
  stages: StageService;
  publish: (topic: LiveTopic | null, msg: ServerMessage) => void;
  publishBinary: (topic: LiveTopic, frame: Uint8Array) => void;
  reportError: (source: "job" | "comfy", title: string, detail: string) => void;
  /** The prompts of each click, for the frequent-tags list. */
  recordPrompts?: (texts: string[]) => void;
}

interface Run {
  job: Job;
  manifest: WorkflowManifest;
  values: Record<string, unknown>;
  stages: WorkflowManifest["stages"];
}

const KEEP_FINISHED = 40;

export function nextSeed(mode: SeedMode, base: number, i: number): number {
  if (mode === "random") return randomSeed();
  if (mode === "increment") return base + i;
  if (mode === "decrement") return Math.max(0, base - i);
  return base;
}

function toSeed(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** ComfyUI's validation errors, rewritten with the workflow's own labels. */
export function describeComfyError(error: unknown, manifest: WorkflowManifest): string {
  if (error instanceof CompileError) return error.message;
  if (!(error instanceof ComfyHttpError))
    return error instanceof Error ? error.message : String(error);
  type NodeError = {
    type?: string;
    message?: string;
    details?: string;
    extra_info?: { input_name?: string; received_value?: unknown };
  };
  const body = error.body as {
    error?: { message?: string; details?: string };
    node_errors?: Record<string, { errors?: NodeError[]; class_type?: string }>;
  } | null;
  const parts: string[] = [];
  for (const [node, entry] of Object.entries(body?.node_errors ?? {})) {
    for (const e of entry.errors ?? []) {
      const input = e.extra_info?.input_name;
      const b = manifest.bindings.find((x) => x.node === node && x.input === input);
      if (e.type === "value_not_in_list" && b?.type === "model")
        parts.push(
          `"${String(e.extra_info?.received_value ?? "")}" isn't in your ${b.modelKind ?? "models"} folder. Pick another ${b.label.toLowerCase()}.`,
        );
      else
        parts.push(
          `${b?.label ?? `${entry.class_type ?? "Node"} ${node}${input ? ` (${input})` : ""}`}: ${e.details || e.message}`,
        );
    }
  }
  if (parts.length) return parts.slice(0, 3).join(" ");
  if (body?.error?.message)
    return `${body.error.message}${body.error.details ? `: ${body.error.details}` : ""}`;
  return error.message;
}

export class JobQueue {
  private readonly deps: QueueDeps;
  private queued: Run[] = [];
  private active: Run | null = null;
  private finished: Job[] = [];
  private seq = 0;
  private loop: { workflowId: string; seedMode: SeedMode; next: number } | null = null;
  private submitting = false;
  /** Socket events that arrived before /prompt answered with the prompt id. */
  private early: ComfyWsMessage[] = [];

  constructor(deps: QueueDeps) {
    this.deps = deps;
    deps.supervisor.on("message", (m) => this.onMessage(m));
    deps.supervisor.on("preview", (p) => this.onPreview(p));
    deps.supervisor.on("status", (s) => this.onStatus(s));
  }

  snapshot(): QueueSnapshot {
    const live = [...(this.active ? [this.active.job] : []), ...this.queued.map((r) => r.job)];
    return {
      jobs: [...live, ...this.finished],
      loop: this.loop !== null,
      waiting: this.queued.length > 0 && !this.active && !this.deps.supervisor.isRunning,
    };
  }

  private publishQueue(): void {
    this.deps.publish("jobs", { t: "queue", queue: this.snapshot() });
  }

  /* ── commands ───────────────────────────────────────────────────────────── */

  async enqueue(body: GenerateBody): Promise<GenerateResponse> {
    const saved = await this.deps.workflows.patchValues(body.workflowId, {
      values: body.values,
      run: { count: body.count, ...(body.seedMode ? { seedMode: body.seedMode } : {}) },
      ...(body.stages ? { stages: body.stages } : {}),
    });
    if (saved.kind !== "generate")
      throw new HttpError(
        400,
        "Batch workflows run from the batch runner, not the Generate button.",
        "not_generate",
      );
    const mode = saved.run.seedMode;
    const seedBinding = bindingFor(saved.bindings, "sampler.seed");
    const base = toSeed(seedBinding ? saved.values[seedBinding.id] : null) ?? randomSeed();
    const jobs: Job[] = [];
    for (let i = 0; i < body.count; i++) jobs.push(this.add(saved, nextSeed(mode, base, i)));
    this.deps.recordPrompts?.(
      saved.bindings
        .filter((b) => b.role === "prompt.positive")
        .map((b) => saved.values[b.id])
        .filter((v): v is string => typeof v === "string"),
    );

    const values: Record<string, unknown> = {};
    if (seedBinding && (mode === "increment" || mode === "decrement")) {
      values[seedBinding.id] = nextSeed(mode, base, body.count);
      await this.deps.workflows.patchValues(saved.id, { values });
    }
    this.loop = body.loop
      ? { workflowId: saved.id, seedMode: mode, next: nextSeed(mode, base, body.count) }
      : this.loop;
    this.prepareComfy();
    this.publishQueue();
    void this.pump();
    return { jobs, values };
  }

  setLoop(on: boolean): void {
    if (!on) this.loop = null;
    this.publishQueue();
  }

  /** Stop the running image; queued runs continue. */
  async interrupt(): Promise<void> {
    const run = this.active;
    if (!run) return;
    const api = this.deps.supervisor.api;
    if (api && run.job.promptId) await api.interrupt(run.job.promptId).catch(() => api.interrupt());
    else this.finish(run, "interrupted");
  }

  /** Stop the running image, drop everything queued and stop looping. */
  async cancelAll(): Promise<void> {
    this.loop = null;
    for (const run of this.queued) this.retire(run.job, "cancelled");
    this.queued = [];
    this.publishQueue();
    await this.interrupt();
  }

  async cancel(id: string): Promise<void> {
    if (this.active?.job.id === id) return this.interrupt();
    const run = this.queued.find((r) => r.job.id === id);
    if (run) {
      this.queued = this.queued.filter((r) => r !== run);
      this.retire(run.job, "cancelled");
    } else {
      this.finished = this.finished.filter((j) => j.id !== id);
    }
    this.publishQueue();
  }

  /** Profile switch: nothing from the previous profile keeps running. */
  async reset(): Promise<void> {
    await this.cancelAll();
    this.finished = [];
    this.publishQueue();
  }

  /* ── running ────────────────────────────────────────────────────────────── */

  private add(manifest: WorkflowManifest, seed: number): Job {
    const width = bindingFor(manifest.bindings, "latent.width");
    const height = bindingFor(manifest.bindings, "latent.height");
    const hasSeed = Boolean(bindingFor(manifest.bindings, "sampler.seed"));
    const w = width ? num(manifest.values[width.id]) : null;
    const h = height ? num(manifest.values[height.id]) : null;
    // With Hires fix on, the image comes out at the Hires size.
    const hires = readStages(manifest.stages).hires;
    const size = hires.enabled
      ? hiresSize(hires, w !== null && h !== null ? { width: w, height: h } : null)
      : null;
    const job: Job = {
      id: randomUUID(),
      seq: ++this.seq,
      workflowId: manifest.id,
      workflowName: manifest.name,
      state: "queued",
      seed: hasSeed ? seed : null,
      width: size?.width ?? w,
      height: size?.height ?? h,
      segments: [{ id: "base", label: "Sampling", nodes: [] }],
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      progress: { value: 0, max: 1, node: null, overall: 0, segment: 0 },
      images: [],
      error: null,
      promptId: null,
    };
    this.queued.push({
      job,
      manifest,
      values: { ...manifest.values },
      stages: structuredClone(manifest.stages),
    });
    return job;
  }

  /** A managed ComfyUI that's stopped or crashed starts when there's work for it. */
  private prepareComfy(): void {
    const s = this.deps.supervisor.status();
    if (s.mode === "managed" && (s.state === "stopped" || s.state === "crashed"))
      void this.deps.supervisor.start();
  }

  private async pump(): Promise<void> {
    if (this.active || this.submitting) return;
    if (this.queued.length === 0) {
      await this.continueLoop();
      if (this.queued.length === 0) return;
    }
    const api = this.deps.supervisor.api;
    if (!api || !this.deps.supervisor.isRunning) {
      const s = this.deps.supervisor.status();
      if (s.state === "missing") {
        for (const run of this.queued)
          this.retire(run.job, "error", s.message ?? "ComfyUI isn't installed.");
        this.queued = [];
      }
      this.publishQueue();
      return;
    }
    const run = this.queued.shift();
    if (!run) return;
    this.submitting = true;
    this.active = run;
    this.early = [];
    run.job.state = "running";
    run.job.startedAt = new Date().toISOString();
    this.publishQueue();
    try {
      const prompt = await this.deps.workflows.prompt(run.job.workflowId);
      const info = await this.deps.supervisor.objectInfo();
      const loraFiles = info
        ? (nodeInputs(info[LORA_LOADER]).find((i) => i.name === "lora_name")?.options ?? null)
        : null;
      const profile = this.deps.profiles.active
        ? await this.deps.profiles.find(this.deps.profiles.active)
        : null;
      const texts = run.manifest.bindings
        .filter((b) => b.type === "prompt")
        .map((b) => String(run.values[b.id] ?? prompt[b.node]?.inputs[b.input] ?? ""));
      const stages = readStages(run.stages);
      // Stage prompts of their own may use wildcards too.
      for (const s of [stages.hires, ...stages.adetailer.units])
        for (const field of ["prompt", "negative"] as const)
          if (s.unlinked.includes(field)) texts.push(s[field]);
      const wildcards = await loadWildcards(profile?.paths.wildcards ?? "", texts);
      const anyStage =
        stages.hires.enabled || stages.adetailer.enabled || stages.controlnet.enabled;
      const controlFiles = stages.controlnet.enabled
        ? stages.controlnet.units.flatMap((u) => (u.enabled && u.image ? [u.image.file] : []))
        : [];
      const compiled = compile({
        manifest: run.manifest,
        prompt,
        values: run.values,
        seed: run.job.seed ?? randomSeed(),
        wildcards,
        loraFiles,
        filenamePrefix: `%year%-%month%-%day%/${run.job.workflowId}`,
        stages,
        stagePackages: anyStage ? await this.deps.stages.packages() : [],
        stageImages: controlFiles.length ? await this.deps.stages.upload(controlFiles) : {},
        objectInfo: info,
      });
      run.job.segments = compiled.segments;
      const res = await api.queuePrompt(compiled.prompt, {
        preview_method: "auto",
        extra_pnginfo: {
          blombo: {
            workflow: run.job.workflowId,
            name: run.job.workflowName,
            seed: run.job.seed,
            values: run.values,
            prompts: compiled.texts,
          },
        },
      });
      run.job.promptId = res.prompt_id;
      this.publishQueue();
      const early = this.early;
      this.early = [];
      for (const msg of early) this.onMessage(msg);
    } catch (error) {
      const message = describeComfyError(error, run.manifest);
      this.finish(run, "error", message);
      // The same mistake would fail every queued run of this workflow; stop them too.
      if (error instanceof CompileError || error instanceof ComfyHttpError) {
        for (const r of this.queued.filter((q) => q.job.workflowId === run.job.workflowId))
          this.retire(r.job, "cancelled");
        this.queued = this.queued.filter((q) => q.job.workflowId !== run.job.workflowId);
        this.loop = null;
        this.publishQueue();
      }
    } finally {
      this.submitting = false;
    }
  }

  private async continueLoop(): Promise<void> {
    const loop = this.loop;
    if (!loop) return;
    try {
      const manifest = await this.deps.workflows.get(loop.workflowId);
      const seed = loop.seedMode === "random" ? randomSeed() : loop.next;
      loop.next = nextSeed(loop.seedMode, loop.next, 1);
      this.add(manifest, seed);
    } catch {
      this.loop = null;
    }
  }

  private retire(job: Job, state: Job["state"], error: string | null = null): void {
    job.state = state;
    job.error = error;
    job.finishedAt = new Date().toISOString();
    this.finished.unshift(job);
    if (this.finished.length > KEEP_FINISHED) this.finished.length = KEEP_FINISHED;
  }

  private finish(
    run: Run,
    state: "done" | "error" | "interrupted",
    error: string | null = null,
  ): void {
    if (this.active !== run) return;
    this.active = null;
    if (state === "done") run.job.progress = { ...run.job.progress, overall: 1 };
    this.retire(run.job, state, error);
    if (state === "error" && error)
      this.deps.reportError("job", `${run.job.workflowName} failed`, error);
    this.publishQueue();
    void this.pump();
  }

  private addImage(run: Run, image: JobImage): void {
    if (
      run.job.images.some(
        (i) =>
          i.filename === image.filename && i.subfolder === image.subfolder && i.type === image.type,
      )
    )
      return;
    run.job.images.push(image);
    this.deps.publish("jobs", { t: "job.image", jobId: run.job.id, image });
  }

  private async collectHistory(run: Run): Promise<void> {
    const api = this.deps.supervisor.api;
    if (!api || !run.job.promptId) return;
    try {
      const entry = (await api.history(run.job.promptId))[run.job.promptId];
      for (const [node, out] of Object.entries(entry?.outputs ?? {}))
        for (const img of out.images ?? []) {
          const parsed = JobImageSchema.safeParse({ ...img, node });
          if (parsed.success) this.addImage(run, parsed.data);
        }
    } catch {
      // Images seen over the socket are enough.
    }
  }

  /* ── ComfyUI events ─────────────────────────────────────────────────────── */

  private onMessage(msg: ComfyWsMessage): void {
    const run = this.active;
    if (!run) return;
    if (run.job.promptId === null) {
      if (this.submitting) this.early.push(msg);
      return;
    }
    const pid = msg.data.prompt_id;
    if (typeof pid === "string" && pid !== run.job.promptId) return;
    if (pid === undefined && msg.type !== "executing") return;
    const d = msg.data;
    switch (msg.type) {
      case "progress": {
        const node = d.node === null || d.node === undefined ? null : String(d.node);
        const value = Number(d.value) || 0;
        const max = Math.max(1, Number(d.max) || 1);
        const segments = run.job.segments;
        const prev = run.job.progress;
        // The part of the run this node belongs to; an unknown node stays in the current one.
        const found = node === null ? -1 : segments.findIndex((s) => s.nodes.includes(node));
        const segment = found >= 0 ? found : prev.segment;
        const n = Math.max(1, segments.length);
        // A detailer runs its steps once per face: never let the bar go backwards.
        const overall = Math.min(
          0.99,
          Math.max(segment === prev.segment ? prev.overall : 0, (segment + value / max) / n),
        );
        run.job.progress = { value, max, node, overall, segment };
        this.deps.publish("jobs", {
          t: "job.progress",
          jobId: run.job.id,
          seq: run.job.seq,
          progress: run.job.progress,
        });
        break;
      }
      case "executed": {
        const output = d.output as { images?: unknown[] } | null | undefined;
        for (const img of output?.images ?? []) {
          const parsed = JobImageSchema.safeParse({
            ...(img as object),
            node: String(d.node ?? ""),
          });
          if (parsed.success) this.addImage(run, parsed.data);
        }
        break;
      }
      case "execution_success":
        void this.collectHistory(run).then(() => this.finish(run, "done"));
        break;
      case "executing":
        // Older ComfyUI signals the end with `executing` for node null.
        if (d.node === null && pid === run.job.promptId)
          void this.collectHistory(run).then(() => this.finish(run, "done"));
        break;
      case "execution_error": {
        const node = d.node_type ? `${String(d.node_type)}: ` : "";
        this.finish(
          run,
          "error",
          `${node}${String(d.exception_message ?? "ComfyUI reported an error.").trim()}`,
        );
        break;
      }
      case "execution_interrupted":
        this.finish(run, "interrupted");
        break;
    }
  }

  private onPreview(p: ComfyPreview): void {
    const run = this.active;
    if (!run?.job.promptId) return;
    if (p.promptId && p.promptId !== run.job.promptId) return;
    this.deps.publishBinary("jobs", encodePreviewFrame(run.job.seq, p.kind, p.image));
  }

  private onStatus(status: ComfyStatus): void {
    if (status.state === "running") {
      void this.pump();
      return;
    }
    const run = this.active;
    if (run && !this.submitting)
      this.finish(
        run,
        "error",
        "ComfyUI stopped while this image was generating. Restart it and try again.",
      );
    if (status.state === "missing" && this.queued.length) void this.pump();
    else this.publishQueue();
  }
}
