import type { LocalModel } from "@shared/models";
import { describe, expect, it } from "vitest";
import { findLocalModel } from "./ModelLinks";

const models = [
  { id: "loras/style/detail.safetensors", file: "style/detail.safetensors", kind: "loras" },
  { id: "checkpoints/detail.safetensors", file: "detail.safetensors", kind: "checkpoints" },
  {
    id: "checkpoints/wai.safetensors",
    file: "wai.safetensors",
    kind: "checkpoints",
    civitai: { modelId: 1, versionId: 11 },
  },
] as unknown as LocalModel[];

describe("findLocalModel", () => {
  it("finds a name by file, of the right kind", () => {
    expect(findLocalModel(models, "Detail", "lora", undefined)?.id).toBe(
      "loras/style/detail.safetensors",
    );
    expect(findLocalModel(models, "detail", "model", undefined)?.id).toBe(
      "checkpoints/detail.safetensors",
    );
    expect(findLocalModel(models, "missing", "model", undefined)).toBeNull();
  });

  it("finds a renamed file by the hash the image recorded", () => {
    const renamed = [
      {
        id: "loras/new-name.safetensors",
        file: "new-name.safetensors",
        kind: "loras",
        sha256: "E".repeat(64),
      },
      ...models,
    ] as unknown as LocalModel[];
    expect(findLocalModel(renamed, "old name", "lora", undefined, "e".repeat(64))?.id).toBe(
      "loras/new-name.safetensors",
    );
  });

  it("finds a Civitai version first, whatever its file is called", () => {
    const ref = { modelId: 1, versionId: 11 };
    expect(findLocalModel(models, "WAI Illustrious", "model", ref)?.id).toBe(
      "checkpoints/wai.safetensors",
    );
  });
});
