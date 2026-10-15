import { describe, expect, it } from "vitest";
import { headerLength, parseSafetensorsHeader } from "./safetensors.ts";

const LORA_HEADER = JSON.stringify({
  __metadata__: {
    ss_base_model_version: "sdxl_base_v1-0",
    ss_network_module: "networks.lora",
    ss_network_dim: "32",
    ss_network_alpha: "16",
    ss_tag_frequency: JSON.stringify({
      "10_style": { "1girl": 40, "silver hair": 12 },
      "5_extra": { "1girl": 5, outdoors: 9 },
    }),
    ss_dataset_dirs: JSON.stringify({ "10_style": { n_repeats: 10, img_count: 40 } }),
    "modelspec.trigger_phrase": "styleword, other word",
  },
  "lora_unet_down_blocks_0.lora_down.weight": {
    dtype: "F16",
    shape: [32, 320],
    data_offsets: [0, 1],
  },
  "lora_unet_down_blocks_0.lora_up.weight": {
    dtype: "F16",
    shape: [320, 32],
    data_offsets: [1, 2],
  },
  "lora_unet_down_blocks_0.alpha": { dtype: "F32", shape: [], data_offsets: [2, 3] },
});

describe("safetensors header", () => {
  it("reads the length prefix", () => {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigUint64(0, 1234n, true);
    expect(headerLength(bytes)).toBe(1234);
    expect(headerLength(new Uint8Array(4))).toBeNull();
  });

  it("decodes kohya metadata and tensor stats", () => {
    const info = parseSafetensorsHeader(LORA_HEADER);
    expect(info.guess).toBe("lora");
    expect(info.tensors).toBe(3);
    expect(info.dtypes).toEqual({ F16: 2, F32: 1 });
    expect(info.parameters).toBe(32 * 320 * 2 + 1);
    expect(info.training).toMatchObject({
      baseModel: "sdxl_base_v1-0",
      network: "networks.lora",
      dim: "32",
      alpha: "16",
      triggerWords: ["styleword", "other word"],
      datasets: [{ name: "10_style", images: 40, repeats: 10 }],
    });
    expect(info.training.tags.slice(0, 2)).toEqual([
      ["1girl", 45],
      ["silver hair", 12],
    ]);
  });

  it("guesses a checkpoint from its tensor names", () => {
    const info = parseSafetensorsHeader(
      JSON.stringify({
        "model.diffusion_model.input_blocks.0.0.weight": { dtype: "F16", shape: [1] },
      }),
    );
    expect(info.guess).toBe("checkpoint");
    expect(info.metadata).toEqual({});
  });
});
