/**
 * Built-in workflow presets: presets/workflows/<id>/ holds the same files as a profile's
 * workflow package. Installing copies one into a profile, where it's the user's to change.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { ApiPrompt } from "../../../shared/workflow/graph.ts";
import { type PresetSummary, WorkflowManifest } from "../../../shared/workflow/manifest.ts";
import { StagePackage } from "../../../shared/workflow/stages.ts";
import { HttpError } from "../../lib/http.ts";
import type { LoadedStage } from "./stages.ts";
import type { WorkflowService } from "./store.ts";

export interface Preset {
  manifest: WorkflowManifest;
  prompt: ApiPrompt;
  graph: unknown | null;
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

export async function readPreset(presetsDir: string, id: string): Promise<Preset> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new HttpError(400, "Invalid preset id.", "bad_id");
  const dir = path.join(presetsDir, "workflows", id);
  try {
    const manifest = WorkflowManifest.parse(await readJson(path.join(dir, "workflow.json")));
    const prompt = ApiPrompt.parse(await readJson(path.join(dir, "prompt.json")));
    const graph = await readJson(path.join(dir, "graph.json")).catch(() => null);
    return { manifest, prompt, graph };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new HttpError(404, `There's no built-in workflow "${id}".`, "preset_missing");
    throw error;
  }
}

export async function listPresets(presetsDir: string): Promise<Preset[]> {
  let ids: string[] = [];
  try {
    ids = (await fs.readdir(path.join(presetsDir, "workflows"), { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
  const out: Preset[] = [];
  for (const id of ids) {
    try {
      out.push(await readPreset(presetsDir, id));
    } catch (error) {
      console.warn(`Skipping preset "${id}": ${String(error)}`);
    }
  }
  return out;
}

/** Stage packages (presets/stages/<id>/stage.json + prompt.json); broken ones are skipped. */
export async function listStagePackages(presetsDir: string): Promise<LoadedStage[]> {
  const root = path.join(presetsDir, "stages");
  let ids: string[] = [];
  try {
    ids = (await fs.readdir(root, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
  const out: LoadedStage[] = [];
  for (const id of ids) {
    try {
      const pkg = StagePackage.parse(await readJson(path.join(root, id, "stage.json")));
      const graph = ApiPrompt.parse(await readJson(path.join(root, id, "prompt.json")));
      out.push({ pkg, graph });
    } catch (error) {
      console.warn(`Skipping stage package "${id}": ${String(error)}`);
    }
  }
  return out;
}

export async function presetSummaries(
  presetsDir: string,
  workflows: WorkflowService,
  profileId?: string,
): Promise<PresetSummary[]> {
  const installed = new Set(
    (await workflows.list(profileId).catch(() => [])).map((w) => w.preset?.id).filter(Boolean),
  );
  return (await listPresets(presetsDir)).map(({ manifest: m }) => ({
    id: m.preset?.id ?? m.id,
    name: m.name,
    kind: m.kind,
    family: m.family,
    description: m.description ?? "",
    version: m.preset?.version ?? 1,
    installed: installed.has(m.preset?.id ?? m.id),
  }));
}

export async function installPreset(
  presetsDir: string,
  workflows: WorkflowService,
  presetId: string,
  profileId?: string,
): Promise<WorkflowManifest> {
  const { manifest, prompt, graph } = await readPreset(presetsDir, presetId);
  return workflows.create(
    {
      ...manifest,
      parentId: null,
      preset: { id: manifest.preset?.id ?? presetId, version: manifest.preset?.version ?? 1 },
      prompt,
      graph,
    },
    profileId,
    presetId,
  );
}
