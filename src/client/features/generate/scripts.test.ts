import { axisInput } from "@shared/scripts";
import type { Binding } from "@shared/workflow/manifest";
import { describe, expect, it } from "vitest";
import { axisTypes, buildScript, initialScript, type ScriptDraft } from "./scripts";

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
const ctx = { count: 2, loraWeight: (f: string) => (f === "ink.safetensors" ? 0.6 : null) };
const base: ScriptDraft = { ...initialScript, on: true };
const xy = (patch: Partial<ScriptDraft["xy"]>): ScriptDraft => ({
  ...base,
  xy: { ...base.xy, ...patch },
});

describe("buildScript", () => {
  it("is nothing when the script is off", () => {
    expect(buildScript({ ...base, on: false }, bindings, values, ctx)).toEqual({
      script: null,
      plan: null,
      error: null,
    });
  });

  it("plans an XY plot with a prompt search/replace axis", () => {
    const r = buildScript(
      xy({ y: { type: "replace", text: "fox\ncat", picks: [] } }),
      bindings,
      values,
      ctx,
    );
    expect(r.error).toBeNull();
    expect(r.plan?.cells).toHaveLength(6);
    expect(r.script).toMatchObject({ kind: "xy", y: { type: "replace", values: ["fox", "cat"] } });
  });

  it("picks models as tiles, and LoRAs at their saved strength or 1", () => {
    const r = buildScript(
      xy({
        x: { type: "model.checkpoint", text: "", picks: ["b.safetensors"] },
        y: { type: "lora", text: "", picks: ["ink.safetensors", "sub/glow.safetensors"] },
      }),
      bindings,
      values,
      ctx,
    );
    expect(r.script).toMatchObject({
      x: { type: "binding", binding: "model.checkpoint", values: ["b.safetensors"] },
      y: {
        type: "lora",
        values: [
          { name: "ink", strength: 0.6 },
          { name: "sub/glow", strength: 1 },
        ],
      },
    });
    const plain = buildScript(
      xy({ x: { type: "lora", text: "", picks: ["ink.safetensors"] }, loraStrength: false }),
      bindings,
      values,
      ctx,
    );
    expect(plain.script).toMatchObject({ x: { values: [{ name: "ink", strength: 1 }] } });
  });

  it("sends the matrix lines and the batch count", () => {
    const r = buildScript(
      {
        ...base,
        kind: "matrix",
        matrix: { ...base.matrix, lines: "hat\n\n scarf ", useBatch: true },
      },
      bindings,
      values,
      ctx,
    );
    expect(r.script).toMatchObject({ lines: ["hat", "scarf"], count: 2, useBatch: true });
    expect(r.plan?.cells).toHaveLength(4);
  });

  it("explains what's missing instead of planning", () => {
    expect(buildScript({ ...base, kind: "matrix" }, bindings, values, ctx).error).toBe(
      "Add the lines to try, one per line.",
    );
    expect(
      buildScript(xy({ x: { type: "lora", text: "", picks: [] } }), bindings, values, ctx).error,
    ).toBe("Pick the values for X.");
  });

  it("offers the workflow's models, LoRA, its parameters and Prompt S/R, but not the other axis's", () => {
    expect(axisTypes(bindings, "none").map((o) => o.value)).toEqual([
      "none",
      "model.checkpoint",
      "lora",
      "sampler.cfg",
      "replace",
    ]);
    expect(axisTypes(bindings, "sampler.cfg").map((o) => o.value)).not.toContain("sampler.cfg");
    expect(axisTypes(bindings, "lora").map((o) => o.value)).toContain("lora");
    expect(axisInput("model.checkpoint", bindings)).toBe("models");
    expect(axisInput("sampler.cfg", bindings)).toBe("text");
  });
});
