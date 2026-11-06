import { describe, expect, it } from "vitest";
import { compareTitle, planCompare } from "./compare.ts";
import { ScriptError } from "./scripts.ts";
import type { Binding } from "./workflow/manifest.ts";

const b = (id: string, type: Binding["type"], label: string, options?: string[]): Binding => ({
  id,
  role: id as Binding["role"],
  node: "1",
  input: id,
  type,
  label,
  hidden: false,
  ...(options ? { options } : {}),
});
const bindings: Binding[] = [
  b("prompt.positive", "prompt", "Prompt"),
  b("sampler.name", "enum", "Sampler", ["euler", "heun", "dpmpp_2m"]),
  b("sampler.scheduler", "enum", "Scheduler", ["normal", "karras", "exponential"]),
  b("sampler.cfg", "float", "CFG scale"),
];
const values = { "prompt.positive": "a fox", "sampler.cfg": 7, "sampler.name": "euler" };
const sampler = { type: "sampler.name", text: "", picks: ["euler", "heun", "dpmpp_2m"] };
const scheduler = {
  type: "sampler.scheduler",
  text: "",
  picks: ["normal", "karras", "exponential"],
};
const cfg = { type: "sampler.cfg", text: "4, 5, 6", picks: [] };
const rows = [sampler, scheduler, cfg];

describe("planCompare", () => {
  it("makes every combination, the first row fastest", () => {
    const plan = planCompare(rows, bindings, values, null);
    expect(plan.cells).toHaveLength(27);
    expect(plan.axes.map((a) => a.name)).toEqual(["Sampler", "Scheduler", "CFG scale"]);
    expect(plan.cells[1]?.coords).toEqual([1, 0, 0]);
    expect(plan.cells[3]?.coords).toEqual([0, 1, 0]);
    expect(plan.cells[26]?.overrides).toEqual({
      "sampler.name": "dpmpp_2m",
      "sampler.scheduler": "exponential",
      "sampler.cfg": 6,
    });
    expect(new Set(plan.cells.map((c) => c.key)).size).toBe(27);
  });

  it("keeps a combination's key when rows move or values are added", () => {
    const a = planCompare(rows, bindings, values, null);
    const moved = planCompare([cfg, sampler, scheduler], bindings, values, null);
    expect(new Set(moved.cells.map((c) => c.key))).toEqual(new Set(a.cells.map((c) => c.key)));
    const more = planCompare(
      [sampler, scheduler, { ...cfg, text: "4, 5, 6, 7" }],
      bindings,
      values,
      null,
    );
    const old = new Set(a.cells.map((c) => c.key));
    expect(more.cells.filter((c) => !old.has(c.key))).toHaveLength(9);
  });

  it("skips empty rows and counts a repeated value once", () => {
    const plan = planCompare(
      [
        { type: "none", text: "", picks: [] },
        { type: "sampler.cfg", text: "4, 4, 5", picks: [] },
      ],
      bindings,
      values,
      null,
    );
    expect(plan.cells.map((c) => c.label)).toEqual(["CFG scale: 4", "CFG scale: 5"]);
  });

  it("says what to fix", () => {
    expect(() => planCompare([], bindings, values, null)).toThrow(ScriptError);
    expect(() => planCompare([cfg, { ...cfg, text: "8" }], bindings, values, null)).toThrow(
      /two rows/,
    );
    // 30 × 3 × 3 is fine; 50 × 3 × 3 × 4 is too many.
    expect(() =>
      planCompare([{ ...cfg, text: "1-30 [30]" }, sampler, scheduler], bindings, values, null),
    ).not.toThrow();
    expect(() =>
      planCompare(
        [
          { ...cfg, text: "1-50 [50]" },
          sampler,
          scheduler,
          { type: "replace", text: "fox, cat, owl, bee", picks: [] },
        ],
        bindings,
        values,
        null,
      ),
    ).toThrow(/at most/);
  });

  it("tells two LoRA rows apart", () => {
    const loras = [
      { type: "lora", text: "", picks: ["a.safetensors", "b.safetensors"] },
      { type: "lora", text: "", picks: ["a.safetensors", "b.safetensors"] },
    ];
    const plan = planCompare(loras, bindings, values, () => 0.5);
    expect(new Set(plan.cells.map((c) => c.key)).size).toBe(4);
    expect(plan.cells[0]?.overrides).toMatchObject({
      "loras.instant": [{ name: "a", strength: 0.5 }],
    });
  });
});

describe("compareTitle", () => {
  it("names a comparison after its rows until it has a name", () => {
    expect(compareTitle({ name: "", axes: rows }, bindings)).toBe(
      "Sampler × Scheduler × CFG scale",
    );
    expect(compareTitle({ name: "Night", axes: rows }, bindings)).toBe("Night");
    expect(compareTitle({ name: "", axes: [] }, bindings)).toBe("New comparison");
  });
});
