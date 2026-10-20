/**
 * Generate scripts (ADR-0014, shared/scripts.ts): a click with a script queues one job per cell
 * through the normal queue, as one group with the same seed. This service follows the group:
 *
 *   matrix / xy  when the last cell is done, the images are fetched from ComfyUI and put into one
 *                labeled grid (lib/grid.ts), saved in the outputs folder by day
 *                (<outputs>/<date>/grids/…, or the profile's grids/ without one) and shown as a
 *                finished "grid" job, so it lands on the image stage like any result
 *   thumbs       each finished image becomes that model's thumbnail in the scope (scopes.ts)
 *
 * Cancelling the group (Cancel, or the group's own cancel) still makes the grid of what finished.
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { GenerateBody, GenerateResponse, Job, JobImage } from "../../shared/jobs.ts";
import type { ServerMessage } from "../../shared/live.ts";
import { randomSeed } from "../../shared/random.ts";
import { planScript, type Script, ScriptError, type ScriptPlan } from "../../shared/scripts.ts";
import { bindingFor, type WorkflowManifest } from "../../shared/workflow/manifest.ts";
import { freePath, writeFileIfAbsent } from "../lib/fsx.ts";
import { composeGrid } from "../lib/grid.ts";
import { HttpError } from "../lib/http.ts";
import type { ComfySupervisor } from "./comfy/supervisor.ts";
import type { JobQueue } from "./jobs.ts";
import type { ProfileService } from "./profiles.ts";
import { saveScopeThumb } from "./scopes.ts";

export interface ScriptDeps {
  queue: JobQueue;
  profiles: ProfileService;
  supervisor: Pick<ComfySupervisor, "api">;
  publish: (msg: ServerMessage) => void;
  /** Index a file Blombo wrote into the outputs folder (the gallery). */
  ingest?: (ref: { filename: string; subfolder: string; type: "output" }) => Promise<unknown>;
  /** Scope thumbnails changed: model lists refresh. */
  onThumbs?: () => void;
}

interface Group {
  id: string;
  profileId: string;
  workflow: Pick<WorkflowManifest, "id" | "name">;
  script: Script;
  plan: ScriptPlan;
  seed: number;
  /** Cell index → its finished job. */
  done: Map<number, Job>;
  /** Thumbs: the model kind the pictures are filed under. */
  kind: "checkpoints" | "diffusion_models" | "loras" | null;
}

const KEEP_GRIDS = 60;
const pad = (n: number) => String(n).padStart(2, "0");

/** The image a job made that's worth keeping (outputs before previews). */
function mainImage(job: Job): JobImage | null {
  return job.images.find((i) => i.type === "output") ?? job.images[0] ?? null;
}

export class ScriptService {
  private readonly deps: ScriptDeps;
  private readonly groups = new Map<string, Group>();
  /** Grid id → file, for /api/scripts/grids/:id. */
  private readonly grids = new Map<string, string>();

  constructor(deps: ScriptDeps) {
    this.deps = deps;
    deps.queue.on("finished", (job) => void this.onFinished(job));
  }

  async run(body: GenerateBody): Promise<GenerateResponse> {
    if (!body.script) throw new HttpError(400, "No script to run.", "no_script");
    const profileId = this.deps.profiles.active;
    if (!profileId) throw new HttpError(409, "Open a profile first.", "no_profile");
    const saved = await this.deps.queue.saveClick(body);
    if (saved.kind !== "generate")
      throw new HttpError(400, "Scripts run generate workflows.", "not_generate");
    let plan: ScriptPlan;
    try {
      plan = planScript(body.script, saved.bindings, saved.values);
    } catch (error) {
      if (error instanceof ScriptError) throw new HttpError(400, error.message, "bad_script");
      throw error;
    }
    // One seed for every cell, so only what's compared changes.
    const seed = saved.run.seedMode === "random" ? randomSeed() : this.deps.queue.baseSeed(saved);
    const seedId = bindingFor(saved.bindings, "sampler.seed")?.id;
    const group: Group = {
      id: randomUUID(),
      profileId,
      workflow: { id: saved.id, name: saved.name },
      script: body.script,
      plan,
      seed,
      done: new Map(),
      kind: this.thumbKind(body.script, saved),
    };
    this.groups.set(group.id, group);
    const jobs = this.deps.queue.addRuns(
      saved,
      plan.cells.map((cell, index) => {
        const own = seedId !== undefined ? Number(cell.overrides[seedId]) : Number.NaN;
        return {
          seed: Number.isFinite(own) ? own : seed,
          values: { ...saved.values, ...cell.overrides },
          group: {
            id: group.id,
            kind: plan.kind,
            title: plan.title,
            index,
            total: plan.cells.length,
            label: cell.label,
          },
        };
      }),
    );
    return { jobs, values: {} };
  }

  /** The grid image file for a grid job's URL. */
  gridFile(id: string): string {
    const file = this.grids.get(id);
    if (!file)
      throw new HttpError(
        404,
        "That grid isn't around anymore. Find it in the gallery.",
        "no_grid",
      );
    return file;
  }

  private thumbKind(script: Script, manifest: WorkflowManifest): Group["kind"] {
    if (script.kind !== "thumbs") return null;
    if (script.target === "lora") return "loras";
    const kind = manifest.bindings.find((b) => b.id === script.binding)?.modelKind;
    return kind === "diffusion_models" ? "diffusion_models" : "checkpoints";
  }

  private async imageBytes(image: JobImage): Promise<Uint8Array | null> {
    const api = this.deps.supervisor.api;
    if (!api) return null;
    const q = new URLSearchParams({
      filename: image.filename,
      subfolder: image.subfolder,
      type: image.type,
    });
    try {
      const res = await api.fetchRaw(`/view?${q.toString()}`);
      return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
    } catch {
      return null;
    }
  }

  private async onFinished(job: Job): Promise<void> {
    const g = job.group ? this.groups.get(job.group.id) : undefined;
    if (!g || !job.group) return;
    g.done.set(job.group.index, job);
    try {
      if (g.script.kind === "thumbs" && job.state === "done") await this.saveThumb(g, job);
      if (g.done.size < g.plan.cells.length) return;
      this.groups.delete(g.id);
      if (g.plan.grid) await this.makeGrid(g);
    } catch (error) {
      console.error("Script follow-up failed:", error);
      this.deps.publish({
        t: "error",
        error: {
          id: randomUUID(),
          at: Date.now(),
          source: "job",
          title: `${g.plan.title}: couldn't finish`,
          detail: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private async saveThumb(g: Group, job: Job): Promise<void> {
    const cell = g.plan.cells[job.group?.index ?? -1];
    const image = mainImage(job);
    if (!cell?.model || !image || !g.kind || g.script.kind !== "thumbs") return;
    const bytes = await this.imageBytes(image);
    if (!bytes) return;
    await saveScopeThumb(
      this.deps.profiles.dir(g.profileId),
      g.script.scope,
      g.kind,
      cell.model,
      bytes,
    );
    this.deps.onThumbs?.();
  }

  private async makeGrid(g: Group): Promise<void> {
    const images: Array<Uint8Array | null> = [];
    for (let i = 0; i < g.plan.cells.length; i++) {
      const job = g.done.get(i);
      const image = job?.state === "done" ? mainImage(job) : null;
      images.push(image ? await this.imageBytes(image) : null);
    }
    if (images.every((i) => i === null)) return;
    const grid = await composeGrid({
      images,
      cols: g.plan.cols,
      rows: g.plan.rows,
      colLabels: g.plan.colLabels,
      rowLabels: g.plan.rowLabels,
      title: `${g.workflow.name} · ${g.plan.title} · seed ${g.seed}`,
    });

    const now = new Date();
    const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const stamp = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const profile = await this.deps.profiles.find(g.profileId);
    const outputs = profile?.paths.outputs.trim() ?? "";
    const dir = outputs
      ? path.join(outputs, day, "grids")
      : path.join(this.deps.profiles.dir(g.profileId), "grids", day);
    const file = await freePath(path.join(dir, `${g.workflow.id}-${g.plan.kind}-${stamp}.png`));
    await writeFileIfAbsent(file, grid.png);
    if (outputs)
      void this.deps
        .ingest?.({ filename: path.basename(file), subfolder: `${day}/grids`, type: "output" })
        .catch(() => undefined);

    const id = randomUUID();
    this.grids.set(id, file);
    if (this.grids.size > KEEP_GRIDS) {
      const oldest = this.grids.keys().next().value;
      if (oldest) this.grids.delete(oldest);
    }
    const at = now.toISOString();
    this.deps.queue.addFinished({
      id,
      seq: 0,
      workflowId: g.workflow.id,
      workflowName: g.workflow.name,
      state: "done",
      seed: g.seed,
      width: grid.width,
      height: grid.height,
      segments: [],
      createdAt: at,
      startedAt: at,
      finishedAt: at,
      progress: { value: 1, max: 1, node: null, overall: 1, segment: 0, rate: null },
      images: [],
      texts: [],
      error: null,
      promptId: null,
      group: {
        id: g.id,
        kind: "grid",
        title: g.plan.title,
        index: 0,
        total: 1,
        label: g.plan.title,
      },
      file: { url: `/api/scripts/grids/${id}`, path: file, width: grid.width, height: grid.height },
      timings: [],
    });
  }
}
