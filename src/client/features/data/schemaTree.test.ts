import { describe, expect, it } from "vitest";
import { z } from "zod";
import { schemaRows } from "./schemaTree";

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
      [0, "version", "1", "1", false],
      [0, "name", "string", null, true],
      [0, "tags", "string[]", "[]", false],
      [0, "folders", "object", null, true],
      [1, "models", "object[]", null, true],
      [2, "path", "string", null, true],
      [0, "note", "string | null", null, false],
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
