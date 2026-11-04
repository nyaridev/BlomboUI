import { describe, expect, it } from "vitest";
import { matchOption, parseAxisValues, planScript, ScriptError, splitList } from "./scripts.ts";
import type { Binding } from "./workflow/manifest.ts";

const b = (over: Partial<Binding> & Pick<Binding, "id" | "type">): Binding => ({
  node: "1",
  input: "x",
  label: over.id,
  hidden: false,
  ...over,
});

const bindings: Binding[] = [
  b({ id: "prompt.positive", type: "prompt", role: "prompt.positive", label: "Prompt" }),
  b({ id: "sampler.cfg", type: "float", role: "sampler.cfg", label: "CFG scale" }),
  b({ id: "sampler.steps", type: "int", role: "sampler.steps", label: "Steps" }),
  b({
    id: "sampler.name",
    type: "enum",
    role: "sampler.name",
    label: "Sampler",
    options: ["euler", "euler_ancestral", "dpmpp_2m"],
  }),
  b({
    id: "model.checkpoint",
    type: "model",
    role: "model.checkpoint",
    label: "Checkpoint",
    options: ["sd15/dreamshaper_8.safetensors", "sdxl/juggernaut.safetensors"],
  }),
  b({ id: "sampler.seed", type: "seed", role: "sampler.seed", label: "Seed" }),
];
const values = {
  "prompt.positive": "a red fox in the snow",
  "sampler.cfg": 7,
  "sampler.steps": 20,
  "sampler.name": "euler",
  "model.checkpoint": "sd15/dreamshaper_8.safetensors",
  "sampler.seed": 42,
};
const withBatch = { ...values, "latent.batch": 4 };
bindings.push(b({ id: "latent.batch", type: "int", role: "latent.batch", label: "Batch size" }));
const size: Binding[] = [
  b({ id: "latent.width", type: "int", role: "latent.width", label: "Width" }),
  b({ id: "latent.height", type: "int", role: "latent.height", label: "Height" }),
];
const find = (id: string) => bindings.find((x) => x.id === id) as Binding;

describe("axis values", () => {
  it("expands number lists and ranges", () => {
    expect(parseAxisValues("4, 6, 8", find("sampler.cfg"))).toEqual([4, 6, 8]);
    expect(parseAxisValues("10-30 (+10)", find("sampler.steps"))).toEqual([10, 20, 30]);
    expect(parseAxisValues("5-1 (-2)", find("sampler.steps"))).toEqual([5, 3, 1]);
    expect(parseAxisValues("1-2 [5]", find("sampler.cfg"))).toEqual([1, 1.25, 1.5, 1.75, 2]);
    expect(parseAxisValues("-1, -2", find("sampler.steps"))).toEqual([-1, -2]);
    // A huge count is refused before anything is built (typing "1-2 [999999999]").
    expect(() => parseAxisValues("1-2 [999999999]", find("sampler.cfg"))).toThrow(/too many/);
  });

  it("matches choices and models loosely, and refuses unknown ones", () => {
    expect(parseAxisValues("Euler, DPMPP_2M", find("sampler.name"))).toEqual(["euler", "dpmpp_2m"]);
    expect(parseAxisValues("juggernaut", find("model.checkpoint"))).toEqual([
      "sdxl/juggernaut.safetensors",
    ]);
    expect(() => parseAxisValues("heun", find("sampler.name"))).toThrow(ScriptError);
    expect(() => parseAxisValues("seven", find("sampler.cfg"))).toThrow(/isn't a number/);
  });

  it("keeps quoted commas together", () => {
    expect(splitList('a, "b, c", d')).toEqual(["a", "b, c", "d"]);
    expect(matchOption(["Loras/Detail.safetensors"], "detail")).toBe("Loras/Detail.safetensors");
  });
});

describe("planScript", () => {
  it("runs each matrix line once, at the end, start or in place of a text", () => {
    const lines = ["hat", "scarf", "night", "rain", "fog"];
    const end = planScript({ kind: "matrix", lines }, bindings, withBatch);
    expect(end.cells).toHaveLength(5);
    // A near-square grid with each line under its image; every run makes one image.
    expect([end.cols, end.rows]).toEqual([3, 2]);
    expect(end.captions).toEqual(lines);
    expect(end.cells[4]).toMatchObject({ col: 1, row: 1, label: "fog" });
    expect(end.cells[0]?.overrides).toEqual({
      "prompt.positive": "a red fox in the snow, hat",
      "latent.batch": 1,
    });
    const start = planScript(
      { kind: "matrix", lines: ["hat,"], insert: "start" },
      bindings,
      values,
    );
    expect(start.cells[0]?.overrides["prompt.positive"]).toBe("hat, a red fox in the snow");
    const sr = planScript(
      { kind: "matrix", lines: ["cat", "owl"], insert: "replace", search: "fox" },
      bindings,
      values,
    );
    expect(sr.cells.map((c) => c.overrides["prompt.positive"])).toEqual([
      "a red cat in the snow",
      "a red owl in the snow",
    ]);
    expect(() =>
      planScript(
        { kind: "matrix", lines: ["x"], insert: "replace", search: "wolf" },
        bindings,
        values,
      ),
    ).toThrow(/"wolf" isn't in the prompts/);
  });

  it("repeats each matrix line for the batch count, one row per line", () => {
    const plan = planScript(
      { kind: "matrix", lines: ["hat", "scarf"], useBatch: true, count: 3 },
      bindings,
      withBatch,
    );
    expect([plan.cols, plan.rows]).toEqual([3, 2]);
    expect(plan.rowLabels).toEqual(["hat", "scarf"]);
    expect(plan.captions).toBeUndefined();
    expect(plan.cells.map((c) => c.repeat ?? 0)).toEqual([0, 1, 2, 0, 1, 2]);
    // The workflow's batch size stays.
    expect(plan.cells[0]?.overrides).toEqual({ "prompt.positive": "a red fox in the snow, hat" });
  });

  it("adds LoRAs to the instant ones and sets width and height together", () => {
    const plan = planScript(
      {
        kind: "xy",
        x: {
          type: "lora",
          values: [
            { name: "styles/ink", strength: 0.7 },
            { name: "detail", strength: 1 },
          ],
        },
        y: { type: "resolution", values: ["832x1216", "1024x1024"] },
      },
      [...bindings, ...size],
      {
        ...values,
        "loras.instant": [
          { name: "detail", strength: 0.4 },
          { name: "mine", strength: 1 },
        ],
      },
    );
    expect(plan.colLabels).toEqual(["ink", "detail"]);
    expect(plan.rowLabels).toEqual(["832×1216", "1024×1024"]);
    expect(plan.cells[0]?.overrides).toEqual({
      "latent.width": 832,
      "latent.height": 1216,
      "loras.instant": [
        { name: "detail", strength: 0.4 },
        { name: "mine", strength: 1 },
        { name: "styles/ink", strength: 0.7 },
      ],
    });
    // The same LoRA already there takes the axis's strength.
    expect(plan.cells[1]?.overrides["loras.instant"]).toEqual([
      { name: "mine", strength: 1 },
      { name: "detail", strength: 1 },
    ]);
    expect(() =>
      planScript({ kind: "xy", x: { type: "resolution", values: ["512x512"] } }, bindings, values),
    ).toThrow(/no width and height/);
  });

  it("draws labels only when asked, with or without the type, and takes one axis", () => {
    const x = { type: "binding" as const, binding: "sampler.steps", values: [20, 30] };
    expect(planScript({ kind: "xy", x, legendType: true }, bindings, values).colLabels).toEqual([
      "Steps: 20",
      "Steps: 30",
    ]);
    const off = planScript({ kind: "xy", x: null, y: x, legend: false }, bindings, values);
    expect([off.cols, off.rows, off.colLabels, off.rowLabels]).toEqual([1, 2, [], []]);
    expect(off.cells[1]?.label).toBe("Steps: 30");
    expect(() => planScript({ kind: "xy" }, bindings, values)).toThrow(/Pick a type/);
    expect(() => planScript({ kind: "xy", x, y: x }, bindings, values)).toThrow(/both Steps/);
  });

  it("crosses two axes row by row, including prompt search/replace", () => {
    const plan = planScript(
      {
        kind: "xy",
        x: { type: "binding", binding: "sampler.cfg", values: [5, 7] },
        y: { type: "replace", values: ["fox", "cat", "owl"] },
      },
      bindings,
      values,
    );
    expect(plan.cols).toBe(2);
    expect(plan.rows).toBe(3);
    expect(plan.cells.map((c) => [c.col, c.row])).toEqual([
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [0, 2],
      [1, 2],
    ]);
    expect(plan.cells[3]?.overrides).toEqual({
      "sampler.cfg": 7,
      "prompt.positive": "a red cat in the snow",
    });
    expect(plan.colLabels).toEqual(["5", "7"]);
    expect(plan.rowLabels).toEqual(["fox", "cat", "owl"]);
    expect(plan.cells[3]?.label).toBe("CFG scale: 7 · Prompt S/R: cat");
    expect(plan.title).toBe("XY plot · CFG scale × Prompt S/R");
  });

  it("says what's wrong instead of queuing a broken plot", () => {
    expect(() =>
      planScript(
        {
          kind: "xy",
          x: { type: "replace", values: ["wolf", "cat"] },
        },
        bindings,
        values,
      ),
    ).toThrow(/"wolf" isn't in the prompts/);
    expect(() =>
      planScript(
        {
          kind: "xy",
          x: {
            type: "binding",
            binding: "sampler.steps",
            values: Array.from({ length: 11 }, (_, i) => i + 1),
          },
          y: {
            type: "binding",
            binding: "sampler.cfg",
            values: Array.from({ length: 10 }, (_, i) => i + 1),
          },
        },
        bindings,
        values,
      ),
    ).toThrow(/110 images/);
    expect(() =>
      planScript(
        { kind: "xy", x: { type: "binding", binding: "nope", values: [1] } },
        bindings,
        values,
      ),
    ).toThrow(/no parameter "nope"/);
  });

  it("makes one run per model for thumbnails", () => {
    const models = planScript(
      {
        kind: "thumbs",
        target: "model",
        binding: "model.checkpoint",
        models: ["sd15/dreamshaper_8.safetensors", "sdxl/juggernaut.safetensors"],
      },
      bindings,
      values,
    );
    expect(models.grid).toBe(false);
    expect(models.cells.map((c) => [c.label, c.overrides["model.checkpoint"]])).toEqual([
      ["dreamshaper_8", "sd15/dreamshaper_8.safetensors"],
      ["juggernaut", "sdxl/juggernaut.safetensors"],
    ]);
    const loras = planScript(
      {
        kind: "thumbs",
        target: "lora",
        binding: "prompt.positive",
        models: ["styles/ink.safetensors"],
        loraWeight: 0.8,
      },
      bindings,
      values,
    );
    // The LoRA runs alone as an instant LoRA (its trigger words come with it); the prompt stays.
    expect(loras.cells[0]?.overrides).toEqual({
      "loras.instant": [{ name: "styles/ink", strength: 0.8 }],
    });
    expect(loras.cells[0]?.model).toBe("styles/ink.safetensors");
  });
});
