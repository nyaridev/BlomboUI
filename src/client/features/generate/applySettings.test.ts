import type { Binding } from "@shared/workflow/manifest";
import { describe, expect, it, vi } from "vitest";

// The module imports client stores; only the pure helper is under test.
vi.mock("@client/ui", () => ({ toast: () => undefined }));
vi.mock("@client/lib/api", () => ({ api: {} }));
vi.mock("@client/lib/queries", () => ({ qk: {}, queryClient: {} }));
vi.mock("@client/lib/session", () => ({ useSession: { getState: () => ({ profileId: null }) } }));
vi.mock("./state", () => ({ useValues: {} }));
vi.mock("./workflow", () => ({ pickWorkflow: () => null, useActiveChoice: {} }));

const { fitValue } = await import("./applySettings");

const b = (patch: Partial<Binding>): Binding => ({
  id: "x",
  node: "1",
  input: "x",
  type: "int",
  label: "X",
  hidden: false,
  ...patch,
});

describe("fitValue", () => {
  it("coerces numbers and keeps text", () => {
    expect(fitValue(b({ type: "int" }), "28")).toBe(28);
    expect(fitValue(b({ type: "float" }), 5.5)).toBe(5.5);
    expect(fitValue(b({ type: "int" }), "abc")).toBeUndefined();
    expect(fitValue(b({ type: "prompt" }), "a cat")).toBe("a cat");
  });

  it("only picks choices the workflow has", () => {
    const sampler = b({ type: "enum", options: ["euler", "dpmpp_2m"] });
    expect(fitValue(sampler, "dpmpp_2m")).toBe("dpmpp_2m");
    expect(fitValue(sampler, "Mystery")).toBeUndefined();
  });

  it("matches models by name across folders and extensions", () => {
    const ckpt = b({
      type: "model",
      options: ["sdxl/juggernaut_xl.safetensors", "sd15/dream.ckpt"],
    });
    expect(fitValue(ckpt, "juggernaut_xl")).toBe("sdxl/juggernaut_xl.safetensors");
    expect(fitValue(ckpt, "other/Dream.safetensors")).toBe("sd15/dream.ckpt");
    expect(fitValue(ckpt, "missing")).toBeUndefined();
  });
});
