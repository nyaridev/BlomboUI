import { describe, expect, it } from "vitest";
import { z } from "zod";
import { salvage } from "./salvage.ts";

const Unit = z.object({
  id: z.string(),
  strength: z.number().min(0).max(3).default(1),
});
const Schema = z.object({
  steps: z.number().int().min(1).max(150).default(20),
  name: z.string().max(5).default("x"),
  units: z.array(Unit).default([]),
});

describe("salvage", () => {
  it("passes valid data through", () => {
    expect(salvage(Schema, { steps: 30 })).toEqual({
      data: { steps: 30, name: "x", units: [] },
      fixed: [],
    });
  });

  it("clamps numbers to their limits and keeps the rest", () => {
    const r = salvage(Schema, { steps: 200, name: "abc" });
    expect(r.data).toEqual({ steps: 150, name: "abc", units: [] });
    expect(r.fixed).toEqual(["steps"]);
    expect(salvage(Schema, { steps: 0 }).data.steps).toBe(1);
  });

  it("removes other bad values so their defaults apply", () => {
    expect(salvage(Schema, { steps: "lots", name: "far too long" }).data).toEqual({
      steps: 20,
      name: "x",
      units: [],
    });
  });

  it("fixes a field inside a list item, or drops an item that can't be fixed", () => {
    const r = salvage(Schema, {
      units: [{ id: "a", strength: 9 }, { strength: 1 }, { id: "c", strength: "?" }],
    });
    expect(r.data.units).toEqual([
      { id: "a", strength: 3 },
      { id: "c", strength: 1 },
    ]);
  });

  it("doesn't change what it was given", () => {
    const input = { steps: 200, units: [{ id: "a", strength: 9 }] };
    salvage(Schema, input);
    expect(input).toEqual({ steps: 200, units: [{ id: "a", strength: 9 }] });
  });
});
