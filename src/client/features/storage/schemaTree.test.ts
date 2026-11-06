import { describe, expect, it } from "vitest";
import { z } from "zod";
import { schemaRows, typeOf } from "./schemaTree";

describe("schemaRows", () => {
  it("lists fields with types, defaults and nesting", () => {
    const schema = z.object({
      version: z.literal(1).default(1),
      name: z.string(),
      tags: z.array(z.string()).default([]),
      folders: z.object({ models: z.array(z.object({ path: z.string() })) }),
      note: z.string().nullable().optional(),
    });
    const rows = schemaRows(z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>);
    expect(rows.map((r) => [r.depth, r.name, r.type, r.def, r.required])).toEqual([
      [0, "version", "always 1", "1", false],
      [0, "name", "text", null, true],
      [0, "tags", "list of texts", "[]", false],
      [0, "folders", "group", null, true],
      [1, "models", "list of groups", null, true],
      [2, "path", "text", null, true],
      [0, "note", "text or empty", null, false],
    ]);
  });

  it("stops at a schema that contains itself", () => {
    const Node: z.ZodType<{ kids: unknown[] }> = z.object({ kids: z.array(z.lazy(() => Node)) });
    const rows = schemaRows(
      z.toJSONSchema(z.object({ root: Node }), { io: "input" }) as Record<string, unknown>,
    );
    expect(rows.length).toBeLessThan(20);
    expect(rows[0]?.name).toBe("root");
  });
});

describe("typeOf", () => {
  it("says types in words", () => {
    expect(typeOf({ type: "string", enum: ["light", "dark"] })).toBe("one of: light, dark");
    expect(typeOf({ type: "boolean" })).toBe("yes / no");
    expect(typeOf({ type: "object", additionalProperties: { type: "number" } })).toBe(
      "numbers by name",
    );
    expect(typeOf({ type: ["integer", "null"] })).toBe("whole number or empty");
  });
});
