import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createConfig, parseFlags } from "../../config.ts";
import { LayoutService } from "../layouts.ts";
import { ProfileService } from "../profiles.ts";
import { SettingsService } from "../settings.ts";
import { bundleFileName, exportBundle, freeName, readBundle } from "./bundle.ts";
import { importWorkflow } from "./import.ts";
import { installPreset } from "./presets.ts";
import { WorkflowService } from "./store.ts";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-bundle-"));
afterAll(() => fs.rm(tmp, { recursive: true, force: true }));

const config = createConfig(
  parseFlags(["--data", path.join(tmp, "data"), "--runtime", path.join(tmp, "runtime")]),
);
const profiles = new ProfileService(config);
const settings = new SettingsService((id) => profiles.dir(id));
const workflows = new WorkflowService(profiles);
const layouts = new LayoutService({ presetsDir: config.presetsDir, profiles, settings });
const app = { name: "BlomboUI", version: "test" };
const ids: string[] = [];

const newProfile = async (name: string) => {
  const p = await profiles.create({
    name,
    accent: "blue",
    theme: "blombo",
    paths: { models: "", outputs: "", wildcards: "" },
    comfy: { mode: "external", url: "http://127.0.0.1:1" },
    presets: [],
  });
  ids.push(p.id);
  return p.id;
};

beforeAll(async () => {
  await newProfile("From");
  await newProfile("To");
});

describe(".blombo bundles", () => {
  it("carry values, stages, the linked layout and the thumbnail to another profile", async () => {
    const [from, to] = ids as [string, string];
    await profiles.open(from);
    const wf = await installPreset(config.presetsDir, workflows, "sd15");
    await workflows.patchValues(wf.id, {
      values: { "prompt.positive": "an owl in a library", "sampler.steps": 33 },
      stages: { hires: { enabled: true, scale: 1.75 } },
    });
    const base = (await layouts.list()).builtins[0];
    if (!base) throw new Error("no built-in layout");
    const layout = await layouts.create({ name: "Portrait work", doc: base, linkTo: wf.id });
    await workflows.update(wf.id, { layout: layout.id });
    const thumb = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#808080" },
    })
      .webp()
      .toBuffer();
    await fs.writeFile(path.join(workflows.root(), wf.id, "thumb.webp"), thumb);
    await workflows.flush();

    const out = await exportBundle(wf.id, { workflows, layouts, app });
    expect(out.name).toBe("SD 1.5.blombo");
    expect(readBundle(out.bytes).layout?.name).toBe("Portrait work");

    await profiles.open(to);
    const first = await importWorkflow(
      { bytes: out.bytes, filename: out.name },
      workflows,
      null,
      layouts,
    );
    expect(first.source).toBe("blombo");
    expect(first.workflow).toMatchObject({
      name: "SD 1.5",
      preset: { id: "sd15" },
      values: { "prompt.positive": "an owl in a library", "sampler.steps": 33 },
      stages: { hires: { enabled: true, scale: 1.75 } },
    });
    const linked = await layouts.find(first.workflow.layout ?? "");
    expect(linked?.name).toBe("Portrait work");
    expect(await workflows.thumb(first.workflow.id)).toEqual(new Uint8Array(thumb));
    expect(await workflows.graph(first.workflow.id)).toBeTruthy();

    // Importing the same file again: a copy, and the same layout is reused.
    const second = await importWorkflow(
      { bytes: out.bytes, filename: out.name },
      workflows,
      null,
      layouts,
    );
    expect(second.workflow.name).toBe("SD 1.5 copy");
    expect(second.workflow.id).not.toBe(first.workflow.id);
    expect(second.workflow.layout).toBe(first.workflow.layout);
    expect(second.findings[0]?.code).toBe("renamed");
    expect((await layouts.list()).custom).toHaveLength(1);
  });

  it("refuses zips that aren't bundles, and drops anything extra", () => {
    const junk = zipSync({ "readme.txt": strToU8("hi") });
    expect(() => readBundle(junk)).toThrow(/damaged or wasn't made by BlomboUI/);
    expect(() => readBundle(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]))).toThrow(/damaged/);
  });

  it("names files and copies safely", () => {
    expect(bundleFileName('My: "best" / flow')).toBe("My best flow.blombo");
    expect(freeName("Portrait", ["portrait", "Portrait copy"])).toBe("Portrait copy 2");
    expect(freeName("New", ["Old"])).toBe("New");
  });
});
