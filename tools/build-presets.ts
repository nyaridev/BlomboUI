/**
 * Rebuilds the generated parts of the built-in workflow presets from their prompt.json:
 * bindings and values (the analyzer) and graph.json (a laid-out canvas for ComfyUI).
 * Name, family, description and version in workflow.json are kept as written.
 *
 *   node tools/build-presets.ts                       (object_info from the test fixture)
 *   node tools/build-presets.ts --comfy http://127.0.0.1:8188   (from a running ComfyUI)
 *
 * Model choices are never baked in: they depend on the user's folders and are filled from
 * ComfyUI when the workflow is opened.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyze } from "../src/server/services/workflows/analyze.ts";
import { apiToUi } from "../src/server/services/workflows/convert.ts";
import { ApiPrompt, ObjectInfo } from "../src/shared/workflow/graph.ts";
import { WorkflowManifest } from "../src/shared/workflow/manifest.ts";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const presetsDir = path.join(root, "presets", "workflows");

async function objectInfo(): Promise<ObjectInfo> {
  const at = process.argv.indexOf("--comfy");
  const url = at > 0 ? process.argv[at + 1] : undefined;
  if (url) {
    const res = await fetch(`${url.replace(/\/+$/, "")}/object_info`);
    return ObjectInfo.parse(await res.json());
  }
  const file = path.join(
    root,
    "src",
    "server",
    "services",
    "workflows",
    "fixtures",
    "object_info.json",
  );
  return ObjectInfo.parse(JSON.parse(await fs.readFile(file, "utf8")));
}

/** The manifest a preset's prompt.json should have (shared with the sync test). */
export function buildPresetManifest(
  current: WorkflowManifest,
  prompt: ApiPrompt,
  info: ObjectInfo,
): WorkflowManifest {
  const a = analyze(prompt, info);
  const bindings = a.bindings.map((b) => {
    if (b.type !== "model") return b;
    const { options: _options, ...rest } = b;
    return rest;
  });
  return { ...current, kind: a.kind, bindings, values: a.values };
}

async function main() {
  const info = await objectInfo();
  for (const id of await fs.readdir(presetsDir)) {
    const dir = path.join(presetsDir, id);
    const manifest = WorkflowManifest.parse(
      JSON.parse(await fs.readFile(path.join(dir, "workflow.json"), "utf8")),
    );
    const prompt = ApiPrompt.parse(
      JSON.parse(await fs.readFile(path.join(dir, "prompt.json"), "utf8")),
    );
    const next = buildPresetManifest(manifest, prompt, info);
    await fs.writeFile(path.join(dir, "workflow.json"), `${JSON.stringify(next, null, 2)}\n`);
    await fs.writeFile(
      path.join(dir, "graph.json"),
      `${JSON.stringify(apiToUi(prompt, info), null, 2)}\n`,
    );
    console.log(`  ✦ ${id}: ${next.bindings.length} bindings`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();
