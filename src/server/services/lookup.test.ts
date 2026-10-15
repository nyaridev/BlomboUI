import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Online, setupOnline } from "./civitai/fixtures/setup.ts";

let o: Online;
beforeAll(async () => {
  o = await setupOnline();
});
afterAll(() => o.close());

describe("looking up local models by hash", () => {
  it("fills name, thumbnail, base model and trigger words without touching the folder", async () => {
    const dir = path.join(o.models, "loras", "mixed");
    await fs.mkdir(dir, { recursive: true });
    // A file that is Civitai's model 1001 v1.0, one Civitai doesn't know, one with an info file.
    await fs.writeFile(path.join(dir, "renamed.safetensors"), o.fake.bytesOf(100111));
    await fs.writeFile(path.join(dir, "homemade.safetensors"), "not on civitai");
    await fs.writeFile(path.join(dir, "known.safetensors"), "x");
    await fs.writeFile(
      path.join(dir, "known.civitai.info"),
      JSON.stringify({ id: 10021, modelId: 1002, name: "v1.0", model: { name: "Known" } }),
    );
    const before = await fs.readdir(dir);
    o.services.models.invalidate();

    o.services.lookup.start();
    await o.services.lookup.whenIdle();
    const state = o.services.lookup.state();
    expect(state).toMatchObject({ running: false, total: 2, done: 2, found: 1, error: null });
    expect(o.fake.requests.filter((r) => r.path.includes("/by-hash/")).length).toBe(2);

    o.services.models.invalidate();
    const list = await o.services.models.list();
    const renamed = list.models.find((m) => m.file === "renamed.safetensors");
    expect(renamed).toMatchObject({
      name: "Cinematic Lighting 1",
      baseModel: "SDXL",
      triggerWords: ["lighting_style", "masterpiece"],
      civitai: { modelId: 1001, versionId: 10011, lookup: true },
    });
    expect(renamed?.thumb).toMatch(/^\/api\/civitai\/image\?u=/);
    expect(list.models.find((m) => m.file === "homemade.safetensors")?.civitai).toBeNull();
    expect(list.models.find((m) => m.file === "known.safetensors")?.civitai).toMatchObject({
      lookup: false,
    });
    const details = await o.services.models.details(renamed?.id ?? "");
    expect(details.civitai?.name).toBe("Cinematic Lighting 1");
    expect(await fs.readdir(dir)).toEqual(before);
    expect(o.messages.some((m) => m.t === "models.lookup")).toBe(true);
  });

  it("doesn't hash or ask again until a file changes", async () => {
    const asked = o.fake.requests.length;
    o.services.lookup.start();
    await o.services.lookup.whenIdle();
    expect(o.services.lookup.state().total).toBe(0);
    expect(o.fake.requests.length).toBe(asked);
  });

  it("stays off when the setting is off", async () => {
    await o.services.settings.update(o.profileId, { civitai: { lookup: false } });
    await fs.writeFile(path.join(o.models, "loras", "new.safetensors"), "new");
    o.services.models.invalidate();
    o.services.lookup.start();
    await o.services.lookup.whenIdle();
    expect(o.services.lookup.state().total).toBe(0);
  });
});
