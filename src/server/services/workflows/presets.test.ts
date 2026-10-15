import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { buildPresetManifest } from "../../../../tools/build-presets.ts";
import { ObjectInfo } from "../../../shared/workflow/graph.ts";
import { createConfig, parseFlags } from "../../config.ts";
import { ProfileService } from "../profiles.ts";
import { compile } from "./compile.ts";
import { installPreset, listPresets, presetSummaries } from "./presets.ts";
import { WorkflowService } from "./store.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const info = ObjectInfo.parse(
  JSON.parse(fs.readFileSync(path.join(here, "fixtures", "object_info.json"), "utf8")),
);
const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "blombo-presets-"));
afterAll(() => fsp.rm(tmp, { recursive: true, force: true }));

const config = createConfig(parseFlags(["--data", tmp]));

describe("built-in presets", async () => {
  const presets = await listPresets(config.presetsDir);

  it("ship at least SD 1.5, SDXL and Illustrious", () => {
    expect(presets.map((p) => p.manifest.id).sort()).toEqual(
      expect.arrayContaining(["illustrious", "sd15", "sdxl"]),
    );
  });

  for (const preset of presets) {
    describe(preset.manifest.id, () => {
      it("matches what the analyzer reads from its prompt.json (run tools/build-presets.ts)", () => {
        const rebuilt = buildPresetManifest(preset.manifest, preset.prompt, info);
        expect(preset.manifest.bindings).toEqual(rebuilt.bindings);
        expect(preset.manifest.values).toEqual(rebuilt.values);
      });

      it("has the roles the default Generate layout uses, and a canvas", () => {
        const roles = preset.manifest.bindings.map((b) => b.role);
        for (const role of [
          "prompt.positive",
          "model.checkpoint",
          "sampler.steps",
          "sampler.seed",
          "latent.width",
        ])
          expect(roles).toContain(role);
        expect(preset.graph).toBeTruthy();
      });

      it("compiles", () => {
        const out = compile({
          manifest: preset.manifest,
          prompt: preset.prompt,
          values: preset.manifest.values,
          seed: 7,
          wildcards: () => undefined,
          loraFiles: null,
          filenamePrefix: "test",
        });
        expect(Object.keys(out.prompt).length).toBe(Object.keys(preset.prompt).length);
      });
    });
  }
});

describe("installing into a profile", () => {
  it("copies the package, marks where it came from and lists it as installed", async () => {
    const profiles = new ProfileService(config);
    const workflows = new WorkflowService(profiles);
    const profile = await profiles.create({
      name: "Preset test",
      accent: "blue",
      theme: "blombo",
      paths: { models: "", outputs: "", wildcards: "" },
      comfy: { mode: "managed", slot: "latest" },
      presets: [],
    });
    const installed = await installPreset(config.presetsDir, workflows, "sdxl", profile.id);
    expect(installed).toMatchObject({
      id: "sdxl",
      preset: { id: "sdxl", version: 1 },
      parentId: null,
    });
    const again = await installPreset(config.presetsDir, workflows, "sdxl", profile.id);
    expect(again.id).toBe("sdxl-2");
    const summaries = await presetSummaries(config.presetsDir, workflows, profile.id);
    expect(summaries.find((s) => s.id === "sdxl")?.installed).toBe(true);
    expect(summaries.find((s) => s.id === "sd15")?.installed).toBe(false);
    expect(fs.existsSync(path.join(workflows.root(profile.id), "sdxl", "graph.json"))).toBe(true);
  });
});
