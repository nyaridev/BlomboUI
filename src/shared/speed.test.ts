import { describe, expect, it } from "vitest";
import { Profile } from "./profile.ts";
import { ComfyLaunch, launchArgs, SAGE_PACK } from "./speed.ts";
import { NodePack } from "./workflow/packs.ts";

describe("launch options", () => {
  it("turns the attention and Triton choices into ComfyUI's flags", () => {
    expect(launchArgs(ComfyLaunch.parse({}))).toEqual([]);
    expect(launchArgs({ attention: "kitchen", triton: true })).toEqual([
      "--use-ck-attention",
      "--enable-triton-backend",
    ]);
    expect(launchArgs({ attention: "sage", triton: false })).toEqual(["--use-sage-attention"]);
    expect(launchArgs({ attention: "flash", triton: false })).toEqual(["--use-flash-attention"]);
  });

  it("reads a profile saved before the launch options with the defaults", () => {
    const profile = Profile.parse({ id: "abc", name: "Old", createdAt: "2026-01-01T00:00:00Z" });
    expect(profile.launch).toEqual({ attention: "default", triton: false });
  });

  it("keeps SageAttention a valid, pinned pip-only pack", () => {
    expect(NodePack.parse(SAGE_PACK)).toEqual(SAGE_PACK);
    for (const line of SAGE_PACK.pip ?? []) expect(line).toMatch(/--hash=sha256:[0-9a-f]{64}/);
  });
});
