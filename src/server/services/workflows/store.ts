/**
 * Workflow packages on disk (ADR-0003): data/profiles/<profile>/workflows/<id>/ with
 * workflow.json (manifest), prompt.json (API graph) and graph.json (UI graph, optional).
 *
 * Value edits arrive on every slider move, so they're merged in memory and written after a
 * short quiet period (and on flush: profile switch, shutdown). Reads see the pending version.
 * Deleting moves the folder to the profile's trash.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { slugifyProfileName } from "../../../shared/profile.ts";
import { ApiPrompt } from "../../../shared/workflow/graph.ts";
import {
  type PatchValuesBody,
  type UpdateWorkflowBody,
  WorkflowManifest,
  type WorkflowSummary,
} from "../../../shared/workflow/manifest.ts";
import { exists, writeJsonAtomic } from "../../lib/fsx.ts";
import { HttpError } from "../../lib/http.ts";
import type { ProfileService } from "../profiles.ts";

const WRITE_DELAY_MS = 400;

export type NewWorkflow = Omit<WorkflowManifest, "format" | "id" | "createdAt" | "updatedAt"> & {
  prompt: ApiPrompt;
  graph: unknown | null;
};

interface Pending {
  file: string;
  manifest: WorkflowManifest;
  timer: ReturnType<typeof setTimeout>;
}

export class WorkflowService {
  private readonly profiles: ProfileService;
  private readonly pending = new Map<string, Pending>();

  constructor(profiles: ProfileService) {
    this.profiles = profiles;
  }

  root(profileId?: string): string {
    const id = profileId ?? this.profiles.active;
    if (!id) throw new HttpError(409, "Open a profile first.", "no_profile");
    return path.join(this.profiles.dir(id), "workflows");
  }

  private dir(id: string, profileId?: string): string {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id))
      throw new HttpError(400, "Invalid workflow id.", "bad_id");
    return path.join(this.root(profileId), id);
  }

  private manifestFile(id: string, profileId?: string): string {
    return path.join(this.dir(id, profileId), "workflow.json");
  }

  async list(profileId?: string): Promise<WorkflowSummary[]> {
    const root = this.root(profileId);
    let names: string[] = [];
    try {
      names = (await fs.readdir(root, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      return [];
    }
    const out: WorkflowSummary[] = [];
    for (const name of names) {
      try {
        const m = await this.get(name, profileId);
        out.push({
          id: m.id,
          name: m.name,
          kind: m.kind,
          family: m.family,
          tags: m.tags,
          parentId: m.parentId,
          preset: m.preset,
          updatedAt: m.updatedAt,
        });
      } catch {
        // A folder without a readable manifest isn't a workflow; skip it.
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(id: string, profileId?: string): Promise<WorkflowManifest> {
    const file = this.manifestFile(id, profileId);
    const pending = this.pending.get(file);
    if (pending) return pending.manifest;
    let text: string;
    try {
      text = await fs.readFile(file, "utf8");
    } catch {
      throw new HttpError(404, `Workflow "${id}" was not found.`, "workflow_missing");
    }
    return WorkflowManifest.parse(JSON.parse(text));
  }

  async prompt(id: string, profileId?: string): Promise<ApiPrompt> {
    const file = path.join(this.dir(id, profileId), "prompt.json");
    try {
      return ApiPrompt.parse(JSON.parse(await fs.readFile(file, "utf8")));
    } catch {
      throw new HttpError(
        500,
        `Workflow "${id}" has no readable prompt.json. Re-import it.`,
        "bad_prompt",
      );
    }
  }

  async graph(id: string, profileId?: string): Promise<unknown | null> {
    try {
      return JSON.parse(
        await fs.readFile(path.join(this.dir(id, profileId), "graph.json"), "utf8"),
      );
    } catch {
      return null;
    }
  }

  /** A free id based on a name ("Night Portrait" → "night-portrait", "night-portrait-2"…). */
  async uniqueId(name: string, profileId?: string): Promise<string> {
    const base = slugifyProfileName(name).replace(/^-+/, "") || "workflow";
    let id = base;
    for (let n = 2; await exists(this.dir(id, profileId)); n++) id = `${base}-${n}`;
    return id;
  }

  async create(input: NewWorkflow, profileId?: string, idHint?: string): Promise<WorkflowManifest> {
    const { prompt, graph, ...rest } = input;
    const now = new Date().toISOString();
    const id = await this.uniqueId(idHint ?? input.name, profileId);
    const manifest = WorkflowManifest.parse({
      ...rest,
      format: "blombo.workflow/1",
      id,
      createdAt: now,
      updatedAt: now,
    });
    const dir = this.dir(id, profileId);
    await writeJsonAtomic(path.join(dir, "prompt.json"), prompt);
    if (graph) await writeJsonAtomic(path.join(dir, "graph.json"), graph);
    await writeJsonAtomic(path.join(dir, "workflow.json"), manifest);
    return manifest;
  }

  /** Merge values (debounced write). Unknown binding ids are kept: a re-sync may bring them back. */
  async patchValues(id: string, body: PatchValuesBody): Promise<WorkflowManifest> {
    const current = await this.get(id);
    const next: WorkflowManifest = {
      ...current,
      values: { ...current.values, ...body.values },
      run: { ...current.run, ...body.run },
      // A stage's settings are replaced whole (the client always sends the full object).
      stages: { ...current.stages, ...body.stages },
      updatedAt: new Date().toISOString(),
    };
    this.schedule(this.manifestFile(id), next);
    return next;
  }

  async update(id: string, body: UpdateWorkflowBody): Promise<WorkflowManifest> {
    const current = await this.get(id);
    const next = WorkflowManifest.parse({
      ...current,
      ...(body.name ? { name: body.name } : {}),
      ...(body.tags ? { tags: body.tags } : {}),
      ...(body.layout !== undefined ? { layout: body.layout } : {}),
      updatedAt: new Date().toISOString(),
    });
    await this.writeNow(this.manifestFile(id), next);
    return next;
  }

  async duplicate(id: string, name?: string): Promise<WorkflowManifest> {
    const source = await this.get(id);
    const copyName = name ?? `${source.name} copy`;
    return this.create(
      {
        ...source,
        name: copyName.slice(0, 80),
        parentId: source.id,
        preset: null,
        prompt: await this.prompt(id),
        graph: await this.graph(id),
      },
      undefined,
      copyName,
    );
  }

  /** Move to data/profiles/<profile>/trash/workflows/ so it can be restored by hand. */
  async remove(id: string): Promise<void> {
    const dir = this.dir(id);
    if (!(await exists(dir)))
      throw new HttpError(404, `Workflow "${id}" was not found.`, "workflow_missing");
    const file = this.manifestFile(id);
    const pending = this.pending.get(file);
    if (pending) {
      clearTimeout(pending.timer);
      this.pending.delete(file);
    }
    const trash = path.join(this.root(), "..", "trash", "workflows", `${id}-${Date.now()}`);
    await fs.mkdir(path.dirname(trash), { recursive: true });
    await fs.rename(dir, trash);
  }

  /** Write every pending manifest now. */
  async flush(): Promise<void> {
    const all = [...this.pending.values()];
    this.pending.clear();
    for (const p of all) clearTimeout(p.timer);
    await Promise.all(all.map((p) => writeJsonAtomic(p.file, p.manifest)));
  }

  private schedule(file: string, manifest: WorkflowManifest): void {
    const prev = this.pending.get(file);
    if (prev) clearTimeout(prev.timer);
    const timer = setTimeout(() => {
      const p = this.pending.get(file);
      if (p?.timer !== timer) return;
      this.pending.delete(file);
      void writeJsonAtomic(file, p.manifest).catch((error) =>
        console.error(`Could not save ${file}:`, error),
      );
    }, WRITE_DELAY_MS);
    this.pending.set(file, { file, manifest, timer });
  }

  private async writeNow(file: string, manifest: WorkflowManifest): Promise<void> {
    const prev = this.pending.get(file);
    if (prev) clearTimeout(prev.timer);
    this.pending.delete(file);
    await writeJsonAtomic(file, manifest);
  }
}
