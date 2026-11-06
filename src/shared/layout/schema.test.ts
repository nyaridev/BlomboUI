import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { allBlocks, LayoutDocument, parentBlock } from "./schema.ts";

const doc = LayoutDocument.parse(
  JSON.parse(
    readFileSync(new URL("../../../presets/layouts/default.json", import.meta.url), "utf8"),
  ),
);
const params = doc.regions.params;

describe("layout groups", () => {
  it("walks into tabs and cards", () => {
    const ids = allBlocks(params).map((b) => b.id);
    expect(ids.slice(0, 4)).toEqual(["passes", "card-first-pass", "source", "p-image-input"]);
    expect(ids).toContain("stage-hires");
  });

  it("finds the group holding a block", () => {
    expect(parentBlock(params, "p-steps")?.id).toBe("card-first-pass");
    expect(parentBlock(params, "stage-adetailer")?.id).toBe("passes");
    expect(parentBlock(params, "passes")).toBeNull();
    expect(parentBlock(params, "nope")).toBeNull();
  });

  it("keeps tabs to cards and stages", () => {
    const bad = {
      ...doc,
      regions: {
        ...doc.regions,
        params: [{ type: "tabs", id: "t", children: [{ type: "params-rest", id: "r" }] }],
      },
    };
    expect(LayoutDocument.safeParse(bad).success).toBe(false);
  });
});
