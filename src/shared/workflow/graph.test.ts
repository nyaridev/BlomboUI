import { describe, expect, it } from "vitest";
import { NodeDef, nodeInputs } from "./graph.ts";

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

describe("nodeInputs", () => {
  it("reads a dynamic combo's choices and socket-only inputs", () => {
    // TextGenerate as ComfyUI 0.44 has it (trimmed).
    const def = NodeDef.parse({
      input: {
        required: {
          sampling_mode: [
            "COMFY_DYNAMICCOMBO_V3",
            {
              options: [
                {
                  key: "on",
                  inputs: {
                    required: { temperature: ["FLOAT", { default: 0.7 }], seed: ["INT", {}] },
                  },
                },
                { key: "off", inputs: { required: {} } },
              ],
            },
          ],
        },
        optional: { system_prompt: ["STRING", { forceInput: true }] },
      },
    });
    const [mode, system] = nodeInputs(def);
    expect(mode?.options).toEqual(["on", "off"]);
    expect(mode?.choices?.on?.map((i) => i.name)).toEqual(["temperature", "seed"]);
    // Only an explicit flag gives a choice's seed a "control after generate" widget.
    expect(mode?.choices?.on?.[1]?.hasControl).toBe(false);
    expect(system?.forceInput).toBe(true);
  });
});
