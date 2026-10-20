/**
 * Stages around the compiler (ADR-0004): the stage packages from presets/stages, the images
 * ControlNet units read, and the checks the Generate screen shows before you run.
 *
 * Control images are copied into the profile (data/profiles/<id>/inputs/<sha>.<ext>, named by
 * content so the same picture is stored once) and sent to ComfyUI's input folder just before a
 * run, so they survive ComfyUI restarts and slot changes. A unit stores only the file name.
 */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ComfyFileRef } from "../../shared/comfy.ts";
import { STAGES, type StageId } from "../../shared/workflow/roles.ts";
import { readStages, type StageImage, type StageReport } from "../../shared/workflow/stages.ts";
import { exists, writeFileIfAbsent } from "../lib/fsx.ts";
import { HttpError } from "../lib/http.ts";
import { readImageHeadBytes } from "../lib/imagemeta.ts";
import type { ComfyClient, ComfyWsMessage } from "./comfy/client.ts";
import type { ComfySupervisor } from "./comfy/supervisor.ts";
import type { GalleryService } from "./gallery/index.ts";
import type { ProfileService } from "./profiles.ts";
import { LOAD_IMAGE, PREVIEW_IMAGE } from "./workflows/nodes.ts";
import { listStagePackages } from "./workflows/presets.ts";
import {
  applyStages,
  INSTALL_HERE,
  INSTALL_IN_COMFY,
  type LoadedStage,
} from "./workflows/stages.ts";
import type { WorkflowService } from "./workflows/store.ts";

/** ComfyUI's input subfolder for Blombo's control images. */
const COMFY_SUBFOLDER = "blombo";
const MAX_IMAGE_BYTES = 64 * 1024 * 1024;
const PREVIEW_TIMEOUT_MS = 180_000;
const FILE = /^[a-f0-9]{16}\.(png|jpg|webp)$/;

export interface StageDeps {
  presetsDir: string;
  profiles: ProfileService;
  workflows: WorkflowService;
  supervisor: ComfySupervisor;
  gallery: GalleryService;
}

export class StageService {
  private readonly deps: StageDeps;
  private loaded: Promise<LoadedStage[]> | null = null;
  /** What's already in a ComfyUI's input folder, per connection (a restart starts over). */
  private readonly uploaded = new WeakMap<ComfyClient, Map<string, string>>();

  constructor(deps: StageDeps) {
    this.deps = deps;
  }

  packages(): Promise<LoadedStage[]> {
    this.loaded ??= listStagePackages(this.deps.presetsDir);
    return this.loaded;
  }

  private inputsDir(): string {
    const id = this.deps.profiles.active;
    if (!id) throw new HttpError(409, "Open a profile first.", "no_profile");
    return path.join(this.deps.profiles.dir(id), "inputs");
  }

  /** The stored file for a stage image name (names are checked, never paths). */
  async inputPath(file: string): Promise<string> {
    if (!FILE.test(file)) throw new HttpError(400, "Invalid image name.", "bad_name");
    const p = path.join(this.inputsDir(), file);
    if (!(await exists(p)))
      throw new HttpError(404, "That control image is gone. Add it again.", "no_image");
    return p;
  }

  /* ── adding images ────────────────────────────────────────────────────── */

  async addImage(
    bytes: Uint8Array,
    label: string,
    source: StageImage["source"],
  ): Promise<StageImage> {
    if (bytes.byteLength === 0) throw new HttpError(400, "The file is empty.", "empty");
    if (bytes.byteLength > MAX_IMAGE_BYTES)
      throw new HttpError(413, "That image is too large (64 MB max).", "too_large");
    const head = await readImageHeadBytes(bytes);
    const ext =
      head.format === "png"
        ? "png"
        : head.format === "jpeg"
          ? "jpg"
          : head.format === "webp"
            ? "webp"
            : null;
    if (!ext || !head.width || !head.height)
      throw new HttpError(400, "Use a PNG, JPEG or WebP image.", "not_image");
    const file = `${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}.${ext}`;
    await writeFileIfAbsent(path.join(this.inputsDir(), file), bytes);
    return {
      file,
      source,
      label: label.replace(/[\\/]/g, "_").slice(0, 200) || file,
      width: head.width,
      height: head.height,
    };
  }

  async addFromGallery(id: number): Promise<StageImage> {
    const file = await this.deps.gallery.filePath(id);
    const bytes = new Uint8Array(await fs.readFile(file));
    return this.addImage(bytes, path.basename(file), "gallery");
  }

  async addFromOutput(ref: ComfyFileRef): Promise<StageImage> {
    const api = this.requireApi();
    const q = new URLSearchParams({
      filename: ref.filename,
      subfolder: ref.subfolder,
      type: ref.type,
    });
    const res = await api.fetchRaw(`/view?${q.toString()}`);
    if (!res.ok)
      throw new HttpError(404, "ComfyUI doesn't have that image anymore.", "image_missing");
    return this.addImage(new Uint8Array(await res.arrayBuffer()), ref.filename, "output");
  }

  /* ── ComfyUI ───────────────────────────────────────────────────────────── */

  private requireApi(): ComfyClient {
    const api = this.deps.supervisor.api;
    if (!api)
      throw new HttpError(
        409,
        "ComfyUI isn't running. Start it from the status menu in the header.",
        "comfy_down",
      );
    return api;
  }

  /** Send stage images to ComfyUI's input folder; returns file → the name LoadImage takes. */
  async upload(files: string[]): Promise<Record<string, string>> {
    const api = this.requireApi();
    let done = this.uploaded.get(api);
    if (!done) {
      done = new Map();
      this.uploaded.set(api, done);
    }
    const out: Record<string, string> = {};
    for (const file of new Set(files)) {
      const known = done.get(file);
      if (known) {
        out[file] = known;
        continue;
      }
      const bytes = new Uint8Array(await fs.readFile(await this.inputPath(file)));
      const res = await api.uploadImage(bytes, file, COMFY_SUBFOLDER);
      const name = res.subfolder ? `${res.subfolder}/${res.name}` : res.name;
      done.set(file, name);
      out[file] = name;
    }
    return out;
  }

  /**
   * What each stage would need for this workflow with these settings: missing ports, custom
   * nodes and models, plus the current ComfyUI choices for its fields. Every stage is checked
   * as if it were on, so the UI can say so before you turn it on.
   */
  async check(workflowId: string, rawStages: unknown): Promise<StageReport> {
    const manifest = await this.deps.workflows.get(workflowId);
    const prompt = await this.deps.workflows.prompt(workflowId);
    const info = await this.deps.supervisor.objectInfo();
    const packages = await this.packages();
    const settings = readStages(rawStages ?? manifest.stages);
    const stages = (["controlnet", "hires", "adetailer"] as StageId[]).flatMap(
      (stage) =>
        applyStages(
          structuredClone(prompt),
          settings,
          packages,
          {
            bindings: manifest.bindings,
            values: manifest.values,
            seed: 0,
            wildcards: null,
            random: Math.random,
            loraFiles: "skip",
            images: null,
            filenamePrefix: "check",
            info,
          },
          stage,
        ).statuses,
    );
    // A managed slot gets the Install button (services/comfy/nodepacks.ts), so say that instead.
    if (this.deps.supervisor.status().mode === "managed")
      for (const s of stages)
        for (const p of s.problems)
          if (p.code === "missing_nodes" && p.packs?.length && p.packs.every((x) => x.ref))
            p.message = p.message.replace(INSTALL_IN_COMFY, INSTALL_HERE);
    return { checked: info !== null, stages };
  }

  /**
   * Run just the preprocessor on a control image and return ComfyUI's preview of the map, so a
   * unit can show what the model will see.
   */
  async previewMap(file: string, preprocessor: string, resolution: number): Promise<ComfyFileRef> {
    const api = this.requireApi();
    if (!preprocessor || preprocessor === "none")
      throw new HttpError(400, "Pick a preprocessor first.", "no_preprocessor");
    const info = await this.deps.supervisor.objectInfo();
    const cn = (await this.packages()).find((p) => p.pkg.stage === "controlnet");
    const pre = cn?.graph.preprocess?.class_type ?? "";
    if (info && !info[pre])
      throw new HttpError(
        409,
        "Previewing needs the ControlNet Auxiliary Preprocessors custom nodes (comfyui_controlnet_aux). Install them in ComfyUI, then restart it.",
        "missing_nodes",
      );
    const name = (await this.upload([file]))[file] as string;
    const prompt = {
      "1": { class_type: LOAD_IMAGE, inputs: { image: name } },
      "2": { class_type: pre, inputs: { image: ["1", 0], preprocessor, resolution } },
      "3": { class_type: PREVIEW_IMAGE, inputs: { images: ["2", 0] } },
    };
    const res = await api.queuePrompt(prompt);
    const outcome = await this.waitFor(res.prompt_id);
    if (outcome) throw new HttpError(500, `The preprocessor failed: ${outcome}`, "preview_failed");
    const entry = (await api.history(res.prompt_id))[res.prompt_id];
    const image = Object.values(entry?.outputs ?? {}).flatMap((o) => o.images ?? [])[0];
    if (!image) throw new HttpError(500, "ComfyUI made no preview image.", "preview_failed");
    return {
      filename: image.filename,
      subfolder: image.subfolder ?? "",
      type: (image.type ?? "temp") as ComfyFileRef["type"],
    };
  }

  /** Resolves with null on success or the error text, when ComfyUI finishes that prompt. */
  private waitFor(promptId: string): Promise<string | null> {
    const supervisor = this.deps.supervisor;
    return new Promise((resolve) => {
      const timer = setTimeout(() => finish("ComfyUI took too long."), PREVIEW_TIMEOUT_MS);
      const off = supervisor.on("message", (m: ComfyWsMessage) => {
        if (m.data.prompt_id !== promptId) return;
        if (m.type === "execution_success") finish(null);
        else if (m.type === "execution_error")
          finish(String(m.data.exception_message ?? "ComfyUI reported an error.").trim());
        else if (m.type === "execution_interrupted") finish("It was interrupted.");
      });
      function finish(result: string | null) {
        clearTimeout(timer);
        off();
        resolve(result);
      }
    });
  }
}

/** Stage ids accepted by routes. */
export function isStageId(s: string): s is StageId {
  return (STAGES as readonly string[]).includes(s);
}
