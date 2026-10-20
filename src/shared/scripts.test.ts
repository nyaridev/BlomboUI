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
  it("makes every combination of matrix terms, half across and half down", () => {
    const plan = planScript({ kind: "matrix", terms: ["hat", "scarf", "night"] }, bindings, values);
    expect(plan.cells).toHaveLength(8);
    expect(plan.cols).toBe(4);
    expect(plan.rows).toBe(2);
    expect(plan.colLabels).toEqual(["(prompt only)", "hat", "scarf", "hat + scarf"]);
    expect(plan.rowLabels).toEqual(["(prompt only)", "night"]);
    expect(plan.cells[7]?.overrides["prompt.positive"]).toBe(
      "a red fox in the snow, hat, scarf, night",
    );
  });

  it("crosses two axes row by row, including prompt search/replace", () => {
    const plan = planScript(
      {
        kind: "xy",
        x: { type: "binding", binding: "sampler.cfg", values: [5, 7] },
        y: { type: "replace", binding: "prompt.positive", values: ["fox", "cat", "owl"] },
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
    expect(plan.colLabels).toEqual(["CFG scale: 5", "CFG scale: 7"]);
    expect(plan.rowLabels).toEqual(["fox", "cat", "owl"]);
    expect(plan.title).toBe("XY plot · CFG scale × Prompt search/replace");
  });

  it("says what's wrong instead of queuing a broken plot", () => {
    expect(() =>
      planScript(
        {
          kind: "xy",
          x: { type: "replace", binding: "prompt.positive", values: ["wolf", "cat"] },
        },
        bindings,
        values,
      ),
    ).toThrow(/"wolf" isn't in prompt/);
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

  it("makes one run per model for scope thumbnails", () => {
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
    expect(loras.cells[0]?.overrides["prompt.positive"]).toBe(
      "a red fox in the snow, <lora:styles/ink:0.8>",
    );
    expect(loras.cells[0]?.model).toBe("styles/ink.safetensors");
  });
});
