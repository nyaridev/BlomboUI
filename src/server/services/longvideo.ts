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
 */
import { randomUUID } from "node:crypto";
import { mediaOf } from "../../shared/gallery.ts";
import type { GenerateBody, GenerateResponse, Job } from "../../shared/jobs.ts";
import type { ServerMessage } from "../../shared/live.ts";
import { randomSeed } from "../../shared/random.ts";
import { planScript, ScriptError, type ScriptPlan } from "../../shared/scripts.ts";
import type { WorkflowManifest } from "../../shared/workflow/manifest.ts";
import { readStages, type StageVideo } from "../../shared/workflow/stages.ts";
import { HttpError } from "../lib/http.ts";
import { type JobQueue, nextSeed } from "./jobs.ts";
import type { ProfileService } from "./profiles.ts";
import type { StageService } from "./stages.ts";
import { sourceModes } from "./workflows/stages.ts";
import type { WorkflowService } from "./workflows/store.ts";

export interface LongVideoDeps {
  queue: JobQueue;
  profiles: Pick<ProfileService, "active">;
  workflows: Pick<WorkflowService, "prompt">;
  stages: Pick<StageService, "packages" | "addVideoFromOutput">;
  publish: (msg: ServerMessage) => void;
}

interface Chain {
  id: string;
  profileId: string;
  manifest: WorkflowManifest;
  plan: ScriptPlan;
  seeds: number[];
}

export class LongVideoService {
  private readonly deps: LongVideoDeps;
  private readonly chains = new Map<string, Chain>();

  constructor(deps: LongVideoDeps) {
    this.deps = deps;
    deps.queue.on("finished", (job) => void this.onFinished(job));
  }

  async run(body: GenerateBody): Promise<GenerateResponse> {
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
    const mode = saved.run.seedMode;
    const seed = mode === "random" ? randomSeed() : this.deps.queue.baseSeed(saved);
    const chain: Chain = {
      id: randomUUID(),
      profileId,
      manifest: saved,
      plan,
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
    if (video) stages.source = { ...stages.source, mode: "extend", video };
    if (!last) stages.smooth = { ...stages.smooth, enabled: false };
    const [job] = this.deps.queue.addRuns(manifest, [
      {
        seed: chain.seeds[index] ?? randomSeed(),
        values: { ...manifest.values, ...cell?.overrides },
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
