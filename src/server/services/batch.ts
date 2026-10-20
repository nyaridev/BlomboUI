/**
 * The batch runner (ADR-0003, ADR-0014): one runner for every `kind: "batch"` workflow
 * (background removal, upscale, captioning, dataset prep, or any imported graph with an input
 * image and no sampler). It lists the input files, queues one job per file through the server
 * queue (the file goes into the workflow's image input, uploaded to ComfyUI right before its
 * run) and, as each job finishes, writes what it made into the output folder:
 *
 *   images  <name>.png (more than one: <name>_2.png…), copied from ComfyUI
 *   text    <name>.txt (a caption or tags; an optional prefix such as a trigger word)
 *
 * One batch runs at a time. "Skip existing" leaves out files whose result is already there, so a
 * stopped batch picks up where it was. A result that would replace a file moves that file to the
 * profile's trash first; the input file itself is never replaced (the result gets "-out").
 */
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  BATCH_IMAGE_EXTENSIONS,
  type BatchCheck,
  type BatchItem,
  type BatchRun,
  type BatchSnapshot,
  MAX_BATCH_FILES,
  type StagedFile,
  type StartBatchBody,
} from "../../shared/batch.ts";
import type { Job, JobImage } from "../../shared/jobs.ts";
import type { LiveTopic, ServerMessage } from "../../shared/live.ts";
import { isApiLink } from "../../shared/workflow/graph.ts";
import { bindingFor } from "../../shared/workflow/manifest.ts";
import type { StageProblem } from "../../shared/workflow/stages.ts";
import { exists, movePath, resolveInside, writeFileAtomic, writeFileIfAbsent } from "../lib/fsx.ts";
import { HttpError } from "../lib/http.ts";
import type { ComfySupervisor } from "./comfy/supervisor.ts";
import type { JobQueue } from "./jobs.ts";
import type { ProfileService } from "./profiles.ts";
import { refreshBindings } from "./workflows/analyze.ts";
import { INSTALL_HERE, INSTALL_IN_COMFY } from "./workflows/stages.ts";
import type { WorkflowService } from "./workflows/store.ts";

export interface BatchDeps {
  queue: JobQueue;
  workflows: WorkflowService;
  profiles: ProfileService;
  supervisor: Pick<ComfySupervisor, "api" | "objectInfo" | "status">;
  publish: (topic: LiveTopic | null, msg: ServerMessage) => void;
  runtimeDir: string;
  /**
   * Repositories the custom node installer trusts (Blombo's own packages). A workflow from
   * elsewhere (an imported bundle) may list others; those are installed inside ComfyUI.
   */
  trustedPacks?: () => Promise<string[]>;
}

interface Source {
  file: string;
  /** Output names start with this. */
  stem: string;
}

interface Active {
  run: BatchRun;
  profileId: string;
  sources: Source[];
  output: string;
  captionPrefix: string;
  remaining: number;
}

const IMAGE_EXT = new Set<string>(BATCH_IMAGE_EXTENSIONS);
const isImage = (name: string) => IMAGE_EXT.has(path.extname(name).toLowerCase());
const MAX_STAGE_BYTES = 200 * 1024 * 1024;

/** Image files in a folder, sorted by name (subfolders too when recursive). */
export async function listImages(folder: string, recursive: boolean): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string, depth: number) => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory() && recursive && depth < 8) await walk(full, depth + 1);
      else if (e.isFile() && isImage(e.name)) out.push(full);
      if (out.length > MAX_BATCH_FILES) return;
    }
  };
  await walk(folder, 0);
  return out;
}

/** Caption text: the prefix (a trigger word) first, then what the workflow said. */
export function captionText(prefix: string, texts: string[]): string {
  const body = texts.join("\n").trim();
  const p = prefix.trim().replace(/,\s*$/, "");
  return p ? (body ? `${p}, ${body}` : p) : body;
}

export class BatchService {
  private readonly deps: BatchDeps;
  private active: Active | null = null;
  private last: BatchRun | null = null;

  constructor(deps: BatchDeps) {
    this.deps = deps;
    deps.queue.on("started", (job) => this.onStarted(job));
    deps.queue.on("finished", (job) => void this.onFinished(job));
  }

  snapshot(): BatchSnapshot {
    return { run: this.active?.run ?? this.last };
  }

  private publishRun(): void {
    this.deps.publish("batch", { t: "batch", run: this.snapshot().run });
  }

  private publishItem(run: BatchRun, item: BatchItem): void {
    this.deps.publish("batch", { t: "batch.item", batchId: run.id, item });
  }

  /** A dropped file, kept in runtime/cache/<profile>/batch-inputs/ so the runner can read it. */
  async stage(bytes: Uint8Array, filename: string): Promise<StagedFile> {
    const profileId = this.deps.profiles.active;
    if (!profileId) throw new HttpError(409, "Open a profile first.", "no_profile");
    const name = path.basename(filename.replace(/\\/g, "/"));
    if (!isImage(name))
      throw new HttpError(
        400,
        `${name} isn't an image Blombo can batch (PNG, JPEG, WebP, BMP).`,
        "not_image",
      );
    if (bytes.byteLength > MAX_STAGE_BYTES)
      throw new HttpError(413, `${name} is too large (200 MB at most).`, "too_large");
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
    const file = path.join(
      this.deps.runtimeDir,
      "cache",
      profileId,
      "batch-inputs",
      `${hash}${path.extname(name).toLowerCase()}`,
    );
    await writeFileIfAbsent(file, bytes);
    return { path: file, name };
  }

  /**
   * What a batch workflow is missing: custom nodes (with the pinned packs a built-in preset
   * lists, so the notice can offer Install) and models that aren't in the folders.
   */
  async check(workflowId: string): Promise<BatchCheck> {
    const manifest = await this.deps.workflows.get(workflowId);
    const prompt = await this.deps.workflows.prompt(workflowId);
    const info = await this.deps.supervisor.objectInfo();
    const makesImages = Object.values(prompt).some((n) => isApiLink(n.inputs.images));
    const makesText = Object.values(prompt).some((n) => {
      const def = info?.[n.class_type];
      return Boolean(def?.output_node && def.output?.includes("STRING"));
    });
    if (!info) return { checked: false, problems: [], makesImages, makesText };
    const problems: StageProblem[] = [];
    const missing = [...new Set(Object.values(prompt).map((n) => n.class_type))].filter(
      (cls) => !info[cls],
    );
    if (missing.length) {
      const packs = manifest.packs.filter((p) => p.nodes.some((n) => missing.includes(n)));
      const unknown = missing.filter((cls) => !packs.some((p) => p.nodes.includes(cls)));
      const names = [...packs.map((p) => p.name), ...unknown.map((c) => `"${c}"`)];
      const managed = this.deps.supervisor.status().mode === "managed";
      const trusted = new Set((await this.deps.trustedPacks?.()) ?? []);
      const how =
        managed &&
        packs.length &&
        !unknown.length &&
        packs.every((p) => p.ref && trusted.has(p.url))
          ? INSTALL_HERE
          : INSTALL_IN_COMFY;
      problems.push({
        code: "missing_nodes",
        message: `${manifest.name} needs ${names.join(" and ")}. ${how}`,
        packs,
      });
    }
    for (const b of refreshBindings(manifest.bindings, prompt, info)) {
      if (b.type !== "model" || !b.options) continue;
      const v = manifest.values[b.id];
      if (typeof v === "string" && v && !b.options.includes(v))
        problems.push({
          code: "missing_model",
          message: `"${v}" isn't in your ${b.modelKind ?? "models"} folder. Pick another ${b.label.toLowerCase()}, or find one in Models → Manager.`,
          ...(b.modelKind ? { modelKind: b.modelKind } : {}),
        });
    }
    return { checked: true, problems, makesImages, makesText };
  }

  async start(body: StartBatchBody): Promise<BatchRun> {
    const profileId = this.deps.profiles.active;
    if (!profileId) throw new HttpError(409, "Open a profile first.", "no_profile");
    if (this.active)
      throw new HttpError(
        409,
        "A batch is already running. Stop it or wait for it to finish.",
        "busy",
      );
    const manifest = await this.deps.workflows.patchValues(body.workflowId, {
      values: body.values,
    });
    if (manifest.kind !== "batch")
      throw new HttpError(
        400,
        "That workflow isn't a batch workflow. Use Generate for it.",
        "not_batch",
      );
    const input = bindingFor(manifest.bindings, "image.input");
    if (!input)
      throw new HttpError(400, "This workflow has no input image to feed files into.", "no_input");
    const prompt = await this.deps.workflows.prompt(manifest.id);
    const makesImages = Object.values(prompt).some((n) => isApiLink(n.inputs.images));

    // The files.
    let sources: Source[];
    let sourceLabel: string;
    if (body.source.type === "folder") {
      const folder = path.resolve(body.source.folder);
      const stat = await fs.stat(folder).catch(() => null);
      if (!stat?.isDirectory())
        throw new HttpError(400, `There's no folder at ${folder}. Pick it again.`, "no_folder");
      const files = await listImages(folder, body.source.recursive);
      if (!files.length)
        throw new HttpError(400, "That folder has no images (PNG, JPEG, WebP, BMP).", "no_images");
      sources = files.map((file) => {
        const rel = path.relative(folder, file);
        return { file, stem: rel.slice(0, rel.length - path.extname(rel).length) };
      });
      sourceLabel = `${folder} (${files.length} image${files.length === 1 ? "" : "s"})`;
    } else {
      sources = body.source.files.map((f) => {
        const name = outputName(f.name) ?? outputName(f.path) ?? "image.png";
        return {
          file: path.resolve(f.path),
          stem: name.slice(0, name.length - path.extname(name).length),
        };
      });
      sourceLabel = `${sources.length} file${sources.length === 1 ? "" : "s"}`;
    }
    if (sources.length > MAX_BATCH_FILES)
      throw new HttpError(
        400,
        `That's more than ${MAX_BATCH_FILES} files. Split the batch.`,
        "too_many",
      );

    // The output folder.
    const output = path.resolve(body.output);
    try {
      await fs.mkdir(output, { recursive: true });
      await fs.access(output, fs.constants.W_OK);
    } catch {
      throw new HttpError(
        400,
        `Blombo can't write to ${output}. Pick another output folder.`,
        "bad_output",
      );
    }

    const run: BatchRun = {
      id: randomUUID(),
      workflowId: manifest.id,
      workflowName: manifest.name,
      state: "running",
      sourceLabel,
      output,
      items: [],
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
    };
    const todo: number[] = [];
    for (const [index, src] of sources.entries()) {
      const item: BatchItem = {
        index,
        name: `${src.stem}${path.extname(src.file)}`,
        jobId: null,
        state: "queued",
        progress: 0,
        outputs: [],
        error: null,
      };
      const target = path.join(output, `${src.stem}${makesImages ? ".png" : ".txt"}`);
      if (!(await exists(src.file))) {
        item.state = "error";
        item.error = "The file isn't there anymore.";
      } else if (body.skipExisting && !samePath(target, src.file) && (await exists(target))) {
        item.state = "skipped";
        item.outputs = [path.relative(output, target)];
      } else todo.push(index);
      run.items.push(item);
    }

    this.active = {
      run,
      profileId,
      sources,
      output,
      captionPrefix: body.captionPrefix,
      remaining: todo.length,
    };
    const seed = this.deps.queue.baseSeed(manifest);
    const jobs = this.deps.queue.addRuns(
      manifest,
      todo.map((index) => ({
        seed,
        values: { ...manifest.values },
        inputs: [{ binding: input.id, file: (sources[index] as Source).file }],
        group: {
          id: run.id,
          kind: "batch",
          title: manifest.name,
          index,
          total: sources.length,
          label: (run.items[index] as BatchItem).name,
        },
      })),
    );
    for (const job of jobs) {
      const item = job.group ? run.items[job.group.index] : undefined;
      if (item) item.jobId = job.id;
    }
    if (todo.length === 0) this.finish("done");
    else this.publishRun();
    return run;
  }

  async cancel(): Promise<void> {
    const a = this.active;
    if (!a) return;
    await this.deps.queue.cancelGroup(a.run.id);
  }

  /** Forget the last finished batch (the panel's "Clear"). */
  clear(): void {
    if (this.active) return;
    this.last = null;
    this.publishRun();
  }

  private finish(state: BatchRun["state"], error: string | null = null): void {
    const a = this.active;
    if (!a) return;
    a.run.state = state;
    a.run.error = error;
    a.run.finishedAt = new Date().toISOString();
    this.last = a.run;
    this.active = null;
    this.publishRun();
  }

  private onStarted(job: Job): void {
    const a = this.active;
    if (!a || job.group?.id !== a.run.id) return;
    const item = a.run.items[job.group.index];
    if (!item) return;
    item.state = "running";
    this.publishItem(a.run, item);
  }

  private async onFinished(job: Job): Promise<void> {
    const a = this.active;
    if (!a || job.group?.id !== a.run.id) return;
    const item = a.run.items[job.group.index];
    const src = a.sources[job.group.index];
    if (!item || !src) return;
    try {
      if (job.state === "done") {
        item.outputs = await this.writeOutputs(a, src, job);
        item.state = "done";
        if (!item.outputs.length) {
          item.state = "error";
          item.error = "The workflow finished without an image or text to save.";
        }
      } else {
        item.state = job.state === "error" ? "error" : "cancelled";
        item.error = job.error;
      }
    } catch (error) {
      item.state = "error";
      item.error = error instanceof Error ? error.message : String(error);
    }
    item.progress = 1;
    this.publishItem(a.run, item);
    a.remaining--;
    if (a.remaining <= 0)
      this.finish(a.run.items.some((i) => i.state === "cancelled") ? "cancelled" : "done");
  }

  private async fetchImage(image: JobImage): Promise<Uint8Array> {
    const api = this.deps.supervisor.api;
    if (!api) throw new Error("ComfyUI went away before the result could be saved.");
    const q = new URLSearchParams({
      filename: image.filename,
      subfolder: image.subfolder,
      type: image.type,
    });
    const res = await api.fetchRaw(`/view?${q.toString()}`);
    if (!res.ok) throw new Error(`ComfyUI didn't hand over ${image.filename} (${res.status}).`);
    return new Uint8Array(await res.arrayBuffer());
  }

  /** Write to `target`; a file already there goes to the profile's trash first. */
  private async put(
    a: Active,
    src: Source,
    target: string,
    data: Uint8Array | string,
  ): Promise<string> {
    // Results stay inside the output folder whatever the input was called.
    let file = resolveInside(a.output, path.relative(a.output, target));
    if (samePath(file, src.file)) {
      const ext = path.extname(file);
      file = `${file.slice(0, file.length - ext.length)}-out${ext}`;
    }
    if (await exists(file)) {
      const trash = resolveInside(
        path.join(this.deps.profiles.dir(a.profileId), "trash", "batch", a.run.id),
        path.relative(a.output, file),
      );
      await fs.mkdir(path.dirname(trash), { recursive: true });
      await movePath(file, trash);
    }
    await writeFileAtomic(file, data);
    return path.relative(a.output, file).split(path.sep).join("/");
  }

  private async writeOutputs(a: Active, src: Source, job: Job): Promise<string[]> {
    const written: string[] = [];
    const saved = job.images.filter((i) => i.type === "output");
    const images = saved.length ? saved : job.images;
    for (const [i, image] of images.entries()) {
      const ext = path.extname(image.filename).toLowerCase() || ".png";
      const name = `${src.stem}${i === 0 ? "" : `_${i + 1}`}${ext}`;
      written.push(await this.put(a, src, path.join(a.output, name), await this.fetchImage(image)));
    }
    if (job.texts.length) {
      const text = captionText(a.captionPrefix, job.texts);
      written.push(await this.put(a, src, path.join(a.output, `${src.stem}.txt`), `${text}\n`));
    }
    return written;
  }
}

/** The same file? Windows paths ignore letter case ("Photo.PNG" is "photo.png"). */
export function samePath(a: string, b: string): boolean {
  const x = path.resolve(a);
  const y = path.resolve(b);
  return process.platform === "win32" ? x.toLowerCase() === y.toLowerCase() : x === y;
}

/**
 * A file name to name outputs after: only the last part of what was sent (no folders, no
 * "..", no characters Windows can't use), or null when nothing usable is left.
 */
export function outputName(raw: string | undefined): string | null {
  if (!raw) return null;
  const last = raw.split(/[\\/]/).pop() ?? "";
  const clean = [...last]
    .map((ch) => (ch.charCodeAt(0) < 32 || '<>:"|?*'.includes(ch) ? "_" : ch))
    .join("")
    .replace(/[. ]+$/, "");
  return clean && clean !== "." && clean !== ".." ? clean : null;
}
