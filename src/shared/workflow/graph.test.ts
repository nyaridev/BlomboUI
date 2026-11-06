import { describe, expect, it } from "vitest";
import { NodeDef } from "./graph.ts";

describe("NodeDef", () => {
  it("keeps a node ComfyUI 0.44 sends with a null display name and category", () => {
    // EmptySD3LatentImage as ComfyUI 0.44's /object_info has it (trimmed).
    const def = NodeDef.safeParse({
      input: { required: { width: ["INT", { default: 1024, min: 16, max: 16384, step: 16 }] } },
      output: ["LATENT"],
      output_name: ["LATENT"],
      output_tooltips: [null],
      name: "EmptySD3LatentImage",
      display_name: null,
      category: null,
      output_node: false,
    });
    expect(def.success).toBe(true);
  });
});
