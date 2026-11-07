/**
 * Long videos (Scripts → Long video, ADR-0021): a chain of parts, each continuing the one before.
 * Part 1 runs with the workflow's own first pass; when a part finishes, its video is copied into
 * the profile as a stage video and the next part is queued as Continue a video from it, with its
 * own prompt. Each part's file is the whole video so far, so the parts before the last go to the
 * workflow's segments/ folder (hidden from the gallery by default) and the last one is saved like
 * any result. Smooth motion runs on the last part only, so the whole video is smoothed once.
 *
 * The parts are one group in the job queue, queued one at a time. Cancelling the group, a part
 * that doesn't finish, or a switch to another profile ends the chain.
 *
 * A workflow that reads its input video in a window (the character swaps: Start at, Length) runs
 * as such a chain when the window holds more frames than one run makes, or when Long video's Parts
 * repeat Length (`split`, `swapWindow`). Its first part reads only its own window; each next one's
 * window is worked out by the splicer from the video so far and the chain's window
 * (`SourceSettings.window`, `partWindow`), so the file is never read whole.
 */
import { randomUUID } from "node:crypto";
import { mediaOf } from "../../shared/gallery.ts";
import type { GenerateBody, GenerateResponse, Job } from "../../shared/jobs.ts";
import type { ServerMessage } from "../../shared/live.ts";
import { randomSeed } from "../../shared/random.ts";
import { planScript, ScriptError, type ScriptPlan } from "../../shared/scripts.ts";
import { partWindow, type SwapWindow, swapWindow } from "../../shared/videoparts.ts";
import type { WorkflowManifest } from "../../shared/workflow/manifest.ts";
import { bindingFor } from "../../shared/workflow/manifest.ts";
import {
  isStageFile,
  readStages,
  type SourceSettings,
  type StageVideo,
} from "../../shared/workflow/stages.ts";
import { HttpError } from "../lib/http.ts";
import { type JobQueue, nextSeed } from "./jobs.ts";
import type { ProfileService } from "./profiles.ts";
import type { StageService } from "./stages.ts";
import { sourceModes } from "./workflows/stages.ts";
import type { WorkflowService } from "./workflows/store.ts";

export interface LongVideoDeps {
  queue: JobQueue;
  profiles: Pick<ProfileService, "active">;
  workflows: Pick<WorkflowService, "prompt" | "get">;
  stages: Pick<StageService, "packages" | "addVideoFromOutput" | "videoInfo">;
  publish: (msg: ServerMessage) => void;
}

interface Chain {
  id: string;
  profileId: string;
  manifest: WorkflowManifest;
  plan: ScriptPlan;
  seeds: number[];
  /** Values the first part runs with instead: a windowed video's first window. */
  first: Record<string, unknown>;
  /** A windowed video's whole window, for each next part's (null for other workflows). */
  window: SourceSettings["window"];
}

/** A windowed input video's window: its runs, and the first one's window. */
type InputWindow = SwapWindow & { first: { start: number; seconds: number } };

export class LongVideoService {
  private readonly deps: LongVideoDeps;
  private readonly chains = new Map<string, Chain>();

  constructor(deps: LongVideoDeps) {
    this.deps = deps;
    deps.queue.on("finished", (job) => void this.onFinished(job));
  }

  /**
   * A click on a workflow that reads a window of its input video (a plain one, or Long video's
   * Parts repeating Length): run it as a chain of the runs that window takes. Null when it isn't
   * such a workflow, or for a plain click that one run does.
   */
  async split(body: GenerateBody): Promise<GenerateResponse | null> {
    const long = body.script?.kind === "long" ? body.script : null;
    if (body.script && !long) return null;
    const manifest = await this.deps.workflows.get(body.workflowId);
    const asked = long?.segments ?? 1;
    const values = { ...manifest.values, ...body.values };
    const window = await this.window(manifest.bindings, values, asked);
    if (!window) return null;
    // Parts that fit in one run (a video shorter than one Length): run it once.
    if (window.parts < 2)
      return long ? this.deps.queue.enqueue({ ...body, script: undefined }) : null;
    // Each run takes the prompt of the part it falls in (SCAIL may run a part in several).
    const prompts = Array.from(
      { length: window.parts },
      (_, i) => long?.prompts[Math.floor((i * asked) / window.parts)] ?? "",
    );
    return this.run({ ...body, script: { kind: "long", segments: window.parts, prompts } }, window);
  }

  /**
   * The window a workflow reads of its input video, in `parts` of Length (1: Length is the whole
   * window), and the runs it takes. Null for a workflow without a windowed input video.
   */
  private async window(
    bindings: WorkflowManifest["bindings"],
    values: Record<string, unknown>,
    parts: number,
  ): Promise<InputWindow | null> {
    const value = (role: string) => {
      const b = bindingFor(bindings, role);
      return b ? values[b.id] : undefined;
    };
    const file = value("video.input");
    if (!isStageFile(file) || !bindingFor(bindings, "video.seconds")) return null;
    const info = await this.deps.stages.videoInfo(file);
    if (!info.fps || !info.duration) return null;
    const want = {
      start: Number(value("video.start")) || 0,
      seconds: Number(value("video.seconds")) || 0,
    };
    // The result's frame rate (H3 makes 24 fps; SCAIL the video's), and the model's longest run.
    const madeFps = Number(value("video.fps")) || info.fps;
    const most = Number(value("video.frames"));
    const plan = swapWindow(
      want,
      parts,
      { seconds: info.duration, fps: info.fps },
      madeFps,
      most > 0 ? most : Number.POSITIVE_INFINITY,
    );
    return { ...plan, first: partWindow(plan, madeFps, Math.round(plan.part * madeFps), 0) };
  }

  async run(body: GenerateBody, window: InputWindow | null = null): Promise<GenerateResponse> {
    if (body.script?.kind !== "long")
      throw new HttpError(400, "No long video to run.", "no_script");
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
    const prompt = await this.deps.workflows.prompt(saved.id);
    const modes = sourceModes(
      prompt,
      await this.deps.stages.packages(),
      saved.bindings,
      "video",
      saved.values,
    );
    if (!modes.includes("extend"))
      throw new HttpError(
        400,
        "Long video needs a video workflow that can continue a video (Wan 2.2, LTX-2.3 or MiniMax H3).",
        "no_extend",
      );
    // The first part reads only its own window of a windowed input video.
    const first: Record<string, unknown> = {};
    for (const [role, v] of [
      ["video.start", window?.first.start],
      ["video.seconds", window?.first.seconds],
    ] as const) {
      const b = bindingFor(saved.bindings, role);
      if (b && v !== undefined) first[b.id] = v;
    }
    const mode = saved.run.seedMode;
    const seed = mode === "random" ? randomSeed() : this.deps.queue.baseSeed(saved);
    const chain: Chain = {
      id: randomUUID(),
      profileId,
      manifest: saved,
      plan,
      first,
      window: window ? { start: window.start, seconds: window.seconds, part: window.part } : null,
      seeds: plan.cells.map((c) =>
        mode === "random" ? randomSeed() : nextSeed(mode, seed, c.repeat ?? 0),
      ),
    };
    this.chains.set(chain.id, chain);
    return { jobs: [this.queuePart(chain, 0, null)], values: {} };
  }

  /** Queue part `index`: the first from the workflow's own first pass, the others from `video`. */
  private queuePart(chain: Chain, index: number, video: StageVideo | null): Job {
    const { manifest, plan } = chain;
    const cell = plan.cells[index];
    const last = index === plan.cells.length - 1;
    const stages = readStages(manifest.stages);
    if (video) stages.source = { ...stages.source, mode: "extend", video, window: chain.window };
    if (!last) stages.smooth = { ...stages.smooth, enabled: false };
    const [job] = this.deps.queue.addRuns(manifest, [
      {
        seed: chain.seeds[index] ?? randomSeed(),
        values: { ...manifest.values, ...cell?.overrides, ...(index === 0 ? chain.first : {}) },
        stages,
        ...(last ? {} : { saveAs: "segments" as const }),
        group: {
          id: chain.id,
          kind: "long",
          title: plan.title,
          index,
          total: plan.cells.length,
          label: cell?.label ?? `Part ${index + 1}`,
        },
      },
    ]);
    if (!job) throw new Error("The queue didn't take the part.");
    return job;
  }

  private async onFinished(job: Job): Promise<void> {
    const chain = job.group ? this.chains.get(job.group.id) : undefined;
    if (!chain || !job.group) return;
    const next = job.group.index + 1;
    if (job.state !== "done" || next >= chain.plan.cells.length) {
      this.chains.delete(chain.id);
      return;
    }
    try {
      if (this.deps.profiles.active !== chain.profileId)
        throw new Error("Another profile was opened, so the rest wasn't queued.");
      const made = job.images.find((i) => i.type === "output" && mediaOf(i.filename) === "video");
      if (!made) throw new Error(`${job.group.label} saved no video to continue from.`);
      const video = await this.deps.stages.addVideoFromOutput({
        filename: made.filename,
        subfolder: made.subfolder,
        type: "output",
      });
      this.queuePart(chain, next, video);
    } catch (error) {
      this.chains.delete(chain.id);
      this.deps.publish({
        t: "error",
        error: {
          id: randomUUID(),
          at: Date.now(),
          source: "job",
          title: `${chain.plan.title}: stopped after ${job.group.label}`,
          detail: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}
