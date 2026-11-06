/**
 * Compare (shared/compare.ts): saved comparisons, one file each in the profile's compare/ folder.
 * Starting one queues a run per combination through the normal queue (one group, the
 * comparison's id), with the comparison's own values and stages and one shared seed, and follows
 * them: each combination's result is saved as it starts and finishes, with the gallery's record
 * of its image (context.ts hands over each new image as the gallery indexes it).
 *
 * After a restart nothing of a comparison is running anymore: combinations that were queued or
 * running read as stopped. Removing a comparison moves its file to the profile's trash; its
 * images stay in the gallery.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  COMPARE_FORMAT,
  type CompareImage,
  type CompareResult,
  CompareTask,
  type CompareUpdate,
  type NewCompareBody,
  planCompare,
} from "../../shared/compare.ts";
import type { GalleryImage } from "../../shared/gallery.ts";
import { fileUrl } from "../../shared/gallery.ts";
import type { Job } from "../../shared/jobs.ts";
import type { ServerMessage } from "../../shared/live.ts";
import { randomSeed } from "../../shared/random.ts";
import { salvage } from "../../shared/salvage.ts";
import { type LoraWeight, ScriptError } from "../../shared/scripts.ts";
import { bindingFor, type WorkflowManifest } from "../../shared/workflow/manifest.ts";
import { movePath, writeJsonAtomic } from "../lib/fsx.ts";
import { HttpError } from "../lib/http.ts";
import type { JobQueue } from "./jobs.ts";
import type { ProfileService } from "./profiles.ts";
import type { WorkflowService } from "./workflows/store.ts";

export interface CompareDeps {
  queue: JobQueue;
  profiles: ProfileService;
  workflows: Pick<WorkflowService, "get">;
  publish: (msg: ServerMessage) => void;
  /** The local LoRAs' saved strengths. */
  loraWeight: () => Promise<LoraWeight>;
}

/** A started comparison: which job is which combination. */
interface Live {
  profileId: string;
  /** Job id → combination key. */
  jobs: Map<string, string>;
}

const ID = /^[a-z0-9-]{1,64}$/;

function toSeed(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

export function compareImage(image: GalleryImage): CompareImage {
  return {
    id: image.id,
    thumb: image.thumb,
    url: fileUrl(image),
    width: image.width,
    height: image.height,
    name: image.name,
  };
}

export class CompareService {
  private readonly deps: CompareDeps;
  /** Profile id → its comparisons, once read. */
  private readonly cache = new Map<string, Map<string, CompareTask>>();
  private readonly live = new Map<string, Live>();
  /** Images the gallery indexed before their job finished (job id → image). */
  private readonly early = new Map<string, CompareImage>();
  /** Changes to comparisons, one after another (each reads what the last one saved). */
  private changes: Promise<unknown> = Promise.resolve();

  constructor(deps: CompareDeps) {
    this.deps = deps;
    deps.queue.on("started", (job) => void this.onStarted(job));
    deps.queue.on("finished", (job) => void this.onFinished(job));
  }

  /* ── reading and saving ─────────────────────────────────────────────── */

  private active(): string {
    const id = this.deps.profiles.active;
    if (!id) throw new HttpError(409, "Open a profile first.", "no_profile");
    return id;
  }

  private dir(profileId: string): string {
    return path.join(this.deps.profiles.dir(profileId), "compare");
  }

  private async tasks(profileId: string): Promise<Map<string, CompareTask>> {
    const cached = this.cache.get(profileId);
    if (cached) return cached;
    const map = new Map<string, CompareTask>();
    let names: string[] = [];
    try {
      names = await fs.readdir(this.dir(profileId));
    } catch {
      // No comparisons yet.
    }
    for (const name of names.filter((n) => n.endsWith(".json"))) {
      try {
        const raw = JSON.parse(await fs.readFile(path.join(this.dir(profileId), name), "utf8"));
        const { data } = salvage(CompareTask, raw);
        if (!ID.test(data.id) || `${data.id}.json` !== name) continue;
        // Nothing runs across a restart.
        if (!this.live.has(data.id) && data.running) {
          data.running = false;
          for (const r of data.results)
            if (r.state === "queued" || r.state === "running") r.state = "cancelled";
        }
        map.set(data.id, data);
      } catch (error) {
        console.warn(`Couldn't read the comparison ${name}:`, error);
      }
    }
    this.cache.set(profileId, map);
    return map;
  }

  private async save(profileId: string, task: CompareTask): Promise<void> {
    (await this.tasks(profileId)).set(task.id, task);
    await writeJsonAtomic(path.join(this.dir(profileId), `${task.id}.json`), task);
  }

  private async need(id: string): Promise<{ profileId: string; task: CompareTask }> {
    const profileId = this.active();
    const task = (await this.tasks(profileId)).get(id);
    if (!task) throw new HttpError(404, "That comparison is gone. Pick another one.", "no_compare");
    return { profileId, task };
  }

  private announce(task: CompareTask | null, id = task?.id ?? ""): void {
    this.deps.publish({ t: "compare", id, task });
  }

  /* ── commands ───────────────────────────────────────────────────────── */

  async list(): Promise<CompareTask[]> {
    const all = [...(await this.tasks(this.active())).values()];
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async create(body: NewCompareBody): Promise<CompareTask> {
    const profileId = this.active();
    const manifest = await this.workflow(body.workflowId);
    const now = new Date().toISOString();
    const seedId = bindingFor(manifest.bindings, "sampler.seed")?.id;
    const values = { ...manifest.values, ...body.values };
    const task: CompareTask = {
      format: COMPARE_FORMAT,
      id: randomUUID(),
      name: body.name,
      workflowId: manifest.id,
      workflowName: manifest.name,
      createdAt: now,
      updatedAt: now,
      values,
      stages: body.stages ?? manifest.stages,
      axes: body.axes,
      // Generate on "random" (its seed box shows -1): a random one, kept for every image.
      seed:
        (manifest.run.seedMode !== "random" && seedId ? toSeed(values[seedId]) : null) ??
        randomSeed(),
      randomSeeds: false,
      running: false,
      results: [],
    };
    await this.save(profileId, task);
    this.announce(task);
    return task;
  }

  /** A copy with the same settings and rows, not started (its images stay with the original). */
  async clone(id: string): Promise<CompareTask> {
    const { profileId, task } = await this.need(id);
    const now = new Date().toISOString();
    const copy: CompareTask = {
      ...structuredClone(task),
      id: randomUUID(),
      name: task.name ? `${task.name} (copy)` : "",
      createdAt: now,
      updatedAt: now,
      running: false,
      results: [],
    };
    await this.save(profileId, copy);
    this.announce(copy);
    return copy;
  }

  update(id: string, patch: CompareUpdate): Promise<CompareTask> {
    return this.serial(() => this.applyUpdate(id, patch));
  }

  private async applyUpdate(id: string, patch: CompareUpdate): Promise<CompareTask> {
    const { profileId, task } = await this.need(id);
    if (task.running && (patch.axes || patch.base || patch.seed !== undefined))
      throw new HttpError(409, "Stop the comparison first, then change it.", "running");
    const next: CompareTask = { ...task, updatedAt: new Date().toISOString() };
    if (patch.name !== undefined) next.name = patch.name;
    if (patch.axes) next.axes = patch.axes;
    if (patch.seed !== undefined) next.seed = patch.seed;
    if (patch.randomSeeds !== undefined) next.randomSeeds = patch.randomSeeds;
    if (patch.seed !== undefined && patch.seed !== task.seed) next.results = [];
    if (patch.base) {
      const manifest = await this.workflow(patch.base.workflowId);
      next.workflowId = manifest.id;
      next.workflowName = manifest.name;
      next.values = { ...manifest.values, ...patch.base.values };
      next.stages = patch.base.stages ?? manifest.stages;
      next.results = [];
    }
    await this.save(profileId, next);
    this.announce(next);
    return next;
  }

  async remove(id: string): Promise<void> {
    const { profileId, task } = await this.need(id);
    if (task.running) await this.stop(id);
    const file = path.join(this.dir(profileId), `${id}.json`);
    const trash = path.join(this.deps.profiles.dir(profileId), "trash", "compare", `${id}.json`);
    await movePath(file, trash).catch(async (error) => {
      // A file of that name in the trash already: this one goes beside it.
      if (error instanceof HttpError && error.code === "exists")
        await movePath(file, trash.replace(/\.json$/, `-${Date.now()}.json`));
      else throw error;
    });
    (await this.tasks(profileId)).delete(id);
    this.announce(null, id);
  }

  start(id: string, mode: "missing" | "all"): Promise<CompareTask> {
    return this.serial(() => this.applyStart(id, mode));
  }

  private async applyStart(id: string, mode: "missing" | "all"): Promise<CompareTask> {
    const { profileId, task } = await this.need(id);
    if (task.running) throw new HttpError(409, "It's already running.", "running");
    const manifest = await this.workflow(task.workflowId);
    const values = { ...manifest.values, ...task.values };
    let plan: ReturnType<typeof planCompare>;
    try {
      plan = planCompare(task.axes, manifest.bindings, values, await this.deps.loraWeight());
    } catch (error) {
      if (error instanceof ScriptError) throw new HttpError(400, error.message, "bad_compare");
      throw error;
    }
    const done = new Set(task.results.filter((r) => r.state === "done").map((r) => r.key));
    const cells = mode === "all" ? plan.cells : plan.cells.filter((c) => !done.has(c.key));
    if (!cells.length)
      throw new HttpError(
        400,
        "Every image is made already. Use Run all again to make them again.",
        "nothing_to_run",
      );

    const seed = task.seed ?? randomSeed();
    const seedId = bindingFor(manifest.bindings, "sampler.seed")?.id;
    const cellSeed = (overrides: Record<string, unknown>): number => {
      // A seed row's own value wins (-1: random).
      const own = seedId !== undefined ? Number(overrides[seedId]) : Number.NaN;
      if (Number.isFinite(own)) return own < 0 ? randomSeed() : own;
      return task.randomSeeds ? randomSeed() : seed;
    };
    const seeds = cells.map((c) => cellSeed(c.overrides));
    const title = `Compare · ${task.name || plan.axes.map((a) => a.name).join(" × ")}`;
    const jobs = this.deps.queue.addRuns(
      manifest,
      cells.map((cell, index) => ({
        seed: seeds[index] ?? seed,
        values: { ...values, ...cell.overrides },
        ...(task.stages ? { stages: task.stages } : {}),
        group: {
          id: task.id,
          kind: "compare",
          title,
          index,
          total: cells.length,
          label: cell.label,
        },
      })),
    );

    const at = new Date().toISOString();
    const byKey = new Map(task.results.map((r) => [r.key, r]));
    cells.forEach((cell, i) => {
      const old = byKey.get(cell.key);
      byKey.set(cell.key, {
        key: cell.key,
        state: "queued",
        seed: seeds[i] ?? seed,
        image: old?.image ?? null,
        error: null,
        at,
      });
    });
    // A run before may still wait for its last image: keep following that one too.
    const live = this.live.get(task.id) ?? { profileId, jobs: new Map<string, string>() };
    for (const [i, j] of jobs.entries()) live.jobs.set(j.id, cells[i]?.key ?? "");
    this.live.set(task.id, live);
    const next: CompareTask = {
      ...task,
      seed,
      running: true,
      updatedAt: at,
      results: [...byKey.values()],
    };
    await this.save(profileId, next);
    this.announce(next);
    return next;
  }

  async stop(id: string): Promise<void> {
    const { profileId, task } = await this.need(id);
    if (this.live.has(id)) {
      await this.deps.queue.cancelGroup(id);
      return;
    }
    if (!task.running) return;
    // Running on paper only (nothing in the queue): settle it.
    await this.serial(() => this.settle(profileId, task.id));
  }

  /* ── following the runs ─────────────────────────────────────────────── */

  /** The gallery indexed a new image (any run's); a run's first image is its result. */
  onImage(jobId: string, image: GalleryImage | null): void {
    if (!image) return;
    for (const [taskId, live] of this.live) {
      const key = live.jobs.get(jobId);
      if (key === undefined) continue;
      const task = this.cache.get(live.profileId)?.get(taskId);
      const result = task?.results.find((r) => r.key === key);
      if (result?.state === "done" && !result.image) {
        // It finished before the gallery got to it.
        live.jobs.delete(jobId);
        if (!task?.running && !live.jobs.size) this.live.delete(taskId);
        void this.setResult(taskId, live.profileId, key, (r) => ({
          ...r,
          image: compareImage(image),
        })).catch((error) => console.warn("Couldn't save a comparison's image:", error));
      } else if (!this.early.has(jobId)) this.early.set(jobId, compareImage(image));
      return;
    }
  }

  private async onStarted(job: Job): Promise<void> {
    const live = job.group?.kind === "compare" ? this.live.get(job.group.id) : undefined;
    const key = live?.jobs.get(job.id);
    if (!live || !job.group || key === undefined) return;
    await this.setResult(job.group.id, live.profileId, key, (r) => ({ ...r, state: "running" }));
  }

  private async onFinished(job: Job): Promise<void> {
    const taskId = job.group?.kind === "compare" ? job.group.id : null;
    const live = taskId ? this.live.get(taskId) : undefined;
    const key = live?.jobs.get(job.id);
    if (!taskId || !live || key === undefined) return;
    const image = this.early.get(job.id) ?? null;
    this.early.delete(job.id);
    const at = new Date().toISOString();
    const state =
      job.state === "done" ? "done" : job.state === "error" ? "error" : ("cancelled" as const);
    // Done without its image yet: onImage fills it in when the gallery has indexed it.
    if (state !== "done" || image) live.jobs.delete(job.id);
    try {
      await this.setResult(taskId, live.profileId, key, (r) => ({
        ...r,
        state,
        at,
        error: state === "error" ? (job.error ?? "The run failed.") : null,
        image: state === "done" ? image : r.image,
      }));
    } catch (error) {
      console.warn("Couldn't save a comparison's result:", error);
    }
  }

  private setResult(
    taskId: string,
    profileId: string,
    key: string,
    change: (r: CompareResult) => CompareResult,
  ): Promise<void> {
    return this.serial(() => this.applyResult(taskId, profileId, key, change));
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const run = this.changes.then(work);
    this.changes = run.catch(() => undefined);
    return run;
  }

  private async applyResult(
    taskId: string,
    profileId: string,
    key: string,
    change: (r: CompareResult) => CompareResult,
  ): Promise<void> {
    const task = (await this.tasks(profileId)).get(taskId);
    if (!task) return;
    const i = task.results.findIndex((r) => r.key === key);
    const old = task.results[i];
    if (!old) return;
    const result = change(old);
    const results = task.results.slice();
    results[i] = result;
    const running = results.some((r) => r.state === "queued" || r.state === "running");
    const next: CompareTask = { ...task, results, running };
    // Nothing left to run or to wait for: stop following it.
    const live = this.live.get(taskId);
    if (!running && live && !live.jobs.size) this.live.delete(taskId);
    await this.save(profileId, next);
    this.deps.publish({ t: "compare.result", id: taskId, result, running });
  }

  private async settle(profileId: string, id: string): Promise<void> {
    const task = (await this.tasks(profileId)).get(id);
    if (!task) return;
    const results = task.results.map((r) =>
      r.state === "queued" || r.state === "running" ? { ...r, state: "cancelled" as const } : r,
    );
    const next = { ...task, results, running: false };
    await this.save(profileId, next);
    this.announce(next);
  }

  private async workflow(id: string): Promise<WorkflowManifest> {
    let manifest: WorkflowManifest;
    try {
      manifest = await this.deps.workflows.get(id);
    } catch {
      throw new HttpError(
        404,
        "The workflow this comparison uses is gone. Take Generate's settings to use another.",
        "no_workflow",
      );
    }
    if (manifest.kind !== "generate")
      throw new HttpError(400, "Comparisons run generate workflows.", "not_generate");
    return manifest;
  }
}
