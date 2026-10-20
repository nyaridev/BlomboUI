import type { Binding } from "@shared/workflow/manifest";
import { describe, expect, it } from "vitest";
import { axisOptions, buildScript, type ScriptDraft } from "./scripts";

const bindings: Binding[] = [
  {
    id: "prompt.positive",
    role: "prompt.positive",
    node: "3",
    input: "text",
    type: "prompt",
    label: "Prompt",
    hidden: false,
  },
  {
    id: "model.checkpoint",
    role: "model.checkpoint",
    node: "1",
    input: "ckpt_name",
    type: "model",
    label: "Checkpoint",
    hidden: false,
    options: ["a.safetensors", "b.safetensors"],
  },
  {
    id: "sampler.cfg",
    role: "sampler.cfg",
    node: "5",
    input: "cfg",
    type: "float",
    label: "CFG scale",
    hidden: false,
  },
];
const values = {
  "prompt.positive": "a fox",
  "sampler.cfg": 7,
  "model.checkpoint": "a.safetensors",
};
const base: ScriptDraft = {
  kind: "off",
  matrix: { binding: "prompt.positive", terms: "" },
  x: { source: "sampler.cfg", text: "4, 6" },
  y: null,
  grid: true,
  thumbs: { target: "model", models: [], scope: "default", loraWeight: 1 },
};

describe("buildScript", () => {
  it("is nothing when the script is off", () => {
    expect(buildScript(base, bindings, values)).toEqual({ script: null, plan: null, error: null });
  });

  it("plans an XY plot with a prompt search/replace axis", () => {
    const r = buildScript(
      { ...base, kind: "xy", y: { source: "sr:prompt.positive", text: "fox\ncat" } },
      bindings,
      values,
    );
    expect(r.error).toBeNull();
    expect(r.plan?.cells).toHaveLength(4);
    expect(r.script).toMatchObject({ kind: "xy", y: { type: "replace", values: ["fox", "cat"] } });
  });

  it("explains what's missing instead of planning", () => {
    expect(buildScript({ ...base, kind: "matrix" }, bindings, values).error).toBe(
      "Add a term to try, one per line.",
    );
    expect(buildScript({ ...base, kind: "thumbs" }, bindings, values).error).toBe(
      "Pick the models to make thumbnails for.",
    );
    const badScope = buildScript(
      {
        ...base,
        kind: "thumbs",
        thumbs: { ...base.thumbs, models: ["a.safetensors"], scope: "My Scope" },
      },
      bindings,
      values,
    );
    expect(badScope.error).toMatch(/lowercase/);
  });

  it("thumbnails swap the checkpoint, one run per model", () => {
    const r = buildScript(
      {
        ...base,
        kind: "thumbs",
        thumbs: { ...base.thumbs, models: ["a.safetensors", "b.safetensors"] },
      },
      bindings,
      values,
    );
    expect(r.plan?.cells.map((c) => c.overrides["model.checkpoint"])).toEqual([
      "a.safetensors",
      "b.safetensors",
    ]);
  });

  it("offers number, model and prompt axes", () => {
    expect(axisOptions(bindings).map((o) => o.value)).toEqual([
      "sr:prompt.positive",
      "model.checkpoint",
      "sampler.cfg",
    ]);
  });
});
