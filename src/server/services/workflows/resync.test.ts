import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ApiPrompt, ObjectInfo } from "../../../shared/workflow/graph.ts";
import { analyze } from "./analyze.ts";
import { resync } from "./resync.ts";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const load = (name: string) =>
  ApiPrompt.parse(JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), "utf8")));
const info = ObjectInfo.parse(
  JSON.parse(fs.readFileSync(path.join(dir, "object_info.json"), "utf8")),
);

/**
 * What comes back from ComfyUI when nothing is changed there: the graph with the workflow's
 * values in it (Edit in ComfyUI opens the canvas that way).
 */
function shown(prompt: ApiPrompt, manifest: ReturnType<typeof saved>["manifest"]): ApiPrompt {
  const out = structuredClone(prompt);
  for (const b of manifest.bindings) {
    const node = out[b.node];
    if (node && b.id in manifest.values) node.inputs[b.input] = manifest.values[b.id];
  }
  return out;
}

/** The dollar-titles workflow as the user left it: values changed from the graph's. */
function saved() {
  const prompt = load("dollar-titles-api");
  const a = analyze(prompt, info);
  const values: Record<string, unknown> = {
    ...a.values,
    "prompt.positive": "a lighthouse at dusk",
    "sampler.steps": 31,
    "n7.sigma": 1.4,
  };
  return { prompt, manifest: { bindings: a.bindings, values, kind: a.kind } };
}

describe("resync", () => {
  it("keeps every value when the graph comes back unchanged", () => {
    const { prompt, manifest } = saved();
    const r = resync(manifest, prompt, shown(prompt, manifest), info);
    expect(r.values).toEqual(manifest.values);
    expect(r.report.added).toEqual([]);
    expect(r.report.removed).toEqual([]);
    expect(r.report.kept).toBe(Object.keys(manifest.values).length);
  });

  it("follows nodes ComfyUI renumbered, by class and title", () => {
    const { prompt, manifest } = saved();
    const next = shown(prompt, manifest);
    // The sharpen node got a new id (copy-pasted, old one deleted).
    next["70"] = next["7"] as ApiPrompt[string];
    delete next["7"];
    (next["9"] as ApiPrompt[string]).inputs.images = ["70", 0];
    const r = resync(manifest, prompt, next, info);
    expect(r.values["n70.sigma"]).toBe(1.4);
    expect(r.values).not.toHaveProperty("n7.sigma");
    expect(r.report.removed).toEqual([]);
    expect(r.report.added).toEqual([]);
  });

  it("reports added and removed parameters and never drops a value", () => {
    const { prompt, manifest } = saved();
    const next = shown(prompt, manifest);
    delete next["7"];
    (next["9"] as ApiPrompt[string]).inputs.images = ["6", 0];
    next["20"] = {
      class_type: "ImageBlur",
      inputs: { image: ["6", 0], blur_radius: 3, sigma: 1 },
      _meta: { title: "$Soften" },
    };
    const r = resync(manifest, prompt, next, info);
    expect(r.report.removed).toEqual([
      "Sharpen · Sharpen radius",
      "Sharpen · Sigma",
      "Sharpen · Alpha",
    ]);
    expect(r.report.added).toEqual(["Soften · Blur radius", "Soften · Sigma"]);
    // The removed node's value is still there if it comes back.
    expect(r.values["n7.sigma"]).toBe(1.4);
    expect(r.values["n20.blur_radius"]).toBe(3);
  });

  it("keeps the prompt by role when the text encoder was replaced", () => {
    const { prompt, manifest } = saved();
    const next = shown(prompt, manifest);
    next["30"] = {
      class_type: "CLIPTextEncode",
      inputs: { text: "replaced", clip: ["1", 1] },
    };
    delete next["2"];
    (next["5"] as ApiPrompt[string]).inputs.positive = ["30", 0];
    const r = resync(manifest, prompt, next, info);
    const positive = r.bindings.find((b) => b.role === "prompt.positive");
    expect(positive?.node).toBe("30");
    expect(r.values["prompt.positive"]).toBe("a lighthouse at dusk");
    expect(r.values["sampler.steps"]).toBe(31);
  });

  it("takes a value that was changed in ComfyUI, and says so", () => {
    const { prompt, manifest } = saved();
    const next = shown(prompt, manifest);
    (next["5"] as ApiPrompt[string]).inputs.steps = 12;
    const r = resync(manifest, prompt, next, info);
    expect(r.values["sampler.steps"]).toBe(12);
    expect(r.report.changed).toEqual(["Steps"]);
    // Untouched in ComfyUI: Blombo's value stays.
    expect(r.values["prompt.positive"]).toBe("a lighthouse at dusk");
  });

  it("doesn't take a value from a different node that reused an id", () => {
    const { prompt, manifest } = saved();
    const next = shown(prompt, manifest);
    // Node 7 is now a blur (different class), not the sharpen node.
    next["7"] = {
      class_type: "ImageBlur",
      inputs: { image: ["6", 0], blur_radius: 2, sigma: 0.5 },
      _meta: { title: "$Blur" },
    };
    const r = resync(manifest, prompt, next, info);
    expect(r.bindings.find((b) => b.id === "n7.sigma")?.label).toBe("Blur · Sigma");
    expect(r.values["n7.sigma"]).toBe(0.5);
    expect(r.report.removed).toContain("Sharpen · Sigma");
  });
});
