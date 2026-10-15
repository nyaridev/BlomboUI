import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { realPng } from "../lib/test-images.ts";
import { inspectBytes } from "./fileinfo.ts";
import { findLoras } from "./workflows/summary.ts";

const graph = await fs.readFile(
  new URL("./workflows/fixtures/sd15-api.json", import.meta.url),
  "utf8",
);
const rgthree = JSON.parse(
  await fs.readFile(new URL("./workflows/fixtures/rgthree-lora-api.json", import.meta.url), "utf8"),
);

describe("File Info", () => {
  it("shows a ComfyUI image's settings, nodes and chunks", async () => {
    const info = await inspectBytes(
      await realPng(10, 12, { prompt: graph, workflow: '{"nodes":[]}' }),
      "x.png",
    );
    expect(info.kind).toBe("image");
    expect(info.image?.summary).toMatchObject({
      source: "comfy",
      steps: 25,
      model: "dreamshaper_8",
    });
    expect(info.image?.hasWorkflow).toBe(true);
    expect(info.image?.comfy?.find((n) => n.id === "3")).toMatchObject({
      type: "KSampler",
      title: "KSampler",
    });
    // links to other nodes aren't shown as values
    expect(info.image?.comfy?.find((n) => n.id === "3")?.inputs.map(([k]) => k)).not.toContain(
      "model",
    );
    expect(info.image?.chunks.map((c) => c.key).sort()).toEqual(["prompt", "workflow"]);
  });

  it("reads a safetensors header from just its first bytes", async () => {
    const json = new TextEncoder().encode(
      JSON.stringify({ __metadata__: { ss_network_dim: "8" } }),
    );
    const bytes = new Uint8Array(8 + json.byteLength);
    new DataView(bytes.buffer).setBigUint64(0, BigInt(json.byteLength), true);
    bytes.set(json, 8);
    const info = await inspectBytes(bytes, "lora.safetensors");
    expect(info.kind).toBe("safetensors");
    expect(info.safetensors?.training.dim).toBe("8");
    const cut = await inspectBytes(bytes.subarray(0, 12), "lora.safetensors");
    expect(cut.error).toMatch(/cut off/);
  });

  it("explains files it can't read", async () => {
    const info = await inspectBytes(new TextEncoder().encode("hello"), "notes.txt");
    expect(info.kind).toBe("unknown");
    expect(info.error).toMatch(/PNG, WebP and JPEG/);
  });

  it("finds LoRAs in loader nodes and rgthree stacks", () => {
    const loras = findLoras(rgthree);
    expect(loras.length).toBeGreaterThan(0);
    for (const l of loras) expect(l.name).not.toMatch(/\.safetensors$/);
  });
});
