import { describe, expect, it } from "vitest";
import { parseCatalog } from "./manager.ts";

const catalog = {
  models: [
    {
      name: "4x-UltraSharp",
      type: "upscale",
      base: "upscale",
      save_path: "default",
      description: "Sharp upscaler",
      reference: "https://example.com",
      filename: "4x-UltraSharp.pth",
      url: "https://huggingface.co/x/4x-UltraSharp.pth",
      size: "64MB",
    },
    {
      name: "face",
      type: "Ultralytics",
      save_path: "ultralytics/bbox",
      filename: "face.pt",
      url: "https://huggingface.co/x/face.pt",
      size: "52MB",
    },
    {
      name: "ip",
      type: "IP-Adapter",
      save_path: "ipadapter",
      filename: "ip.bin",
      url: "https://h/ip.bin",
    },
    {
      name: "node",
      type: "lora",
      save_path: "custom_nodes/x",
      filename: "n.safetensors",
      url: "https://h/n",
    },
    {
      name: "plain http",
      type: "lora",
      save_path: "loras",
      filename: "a.safetensors",
      url: "http://h/a",
    },
    {
      name: "escape",
      type: "lora",
      save_path: "loras",
      filename: "../a.safetensors",
      url: "https://h/a",
    },
    {
      name: "dup",
      type: "upscale",
      save_path: "upscale_models",
      filename: "4x-UltraSharp.pth",
      url: "https://h/d",
    },
  ],
};

describe("parseCatalog", () => {
  it("maps entries to folders, kinds and sizes and skips unsafe ones", () => {
    const entries = parseCatalog(catalog);
    expect(entries.map((e) => e.name)).toEqual(["4x-UltraSharp", "face", "ip", "node"]);
    expect(entries[0]).toMatchObject({
      folder: "upscale_models",
      kind: "upscale_models",
      category: "upscalers",
      size: 64 * 1024 * 1024,
      standard: true,
      host: "huggingface.co",
    });
    expect(entries[1]).toMatchObject({
      folder: "ultralytics/bbox",
      kind: "ultralytics",
      standard: true,
    });
    expect(entries[2]).toMatchObject({ folder: "ipadapter", kind: null, standard: false });
    expect(entries[3]?.folder).toBeNull();
  });

  it("accepts plain http only from the catalog's own origin", () => {
    expect(parseCatalog(catalog, "http://h").some((e) => e.name === "plain http")).toBe(true);
    expect(parseCatalog({ nope: true })).toEqual([]);
  });
});
