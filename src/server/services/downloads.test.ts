import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Download } from "../../shared/downloads.ts";
import { FAKE_KEY } from "./civitai/fixtures/fake-civitai.ts";
import { type Online, setupOnline, waitFor } from "./civitai/fixtures/setup.ts";

let o: Online;
beforeAll(async () => {
  o = await setupOnline({ fileKb: 256 });
});
afterAll(() => o.close());

const q = () => o.services.downloads;
const finished = (id: string) =>
  waitFor(() => {
    const d = q()
      .snapshot()
      .items.find((i) => i.id === id);
    return d && ["done", "error", "cancelled", "paused"].includes(d.state) ? d : null;
  });
const abs = (rel: string) => path.join(o.models, ...rel.split("/"));

describe("Civitai downloads", () => {
  it("plans the destination from the settings", async () => {
    await o.services.settings.update(o.profileId, {
      civitai: {
        downloads: {
          folderBy: ["baseModel", "creator"],
          aliases: [{ from: "pixelsmith", to: "Pixel Smith" }],
        },
      },
    });
    const plan = await q().plan({ source: "civitai", modelId: 1001, versionId: 10011 });
    expect(plan.kindFolder).toBe("loras");
    expect(plan.folder).toBe("SDXL 1.0/Pixel Smith");
    expect(plan.file).toBe("Cinematic_Lighting_v1.safetensors");
    expect(plan.blocked).toBeNull();
    expect(plan.installed).toBeNull();
  });

  it("downloads, checks the hash, saves sidecars and marks the model installed", async () => {
    const d = await q().enqueue({ source: "civitai", modelId: 1001, versionId: 10011 });
    const done = await finished(d.id);
    expect(done.state).toBe("done");
    expect(done.dest).toBe("loras/SDXL 1.0/Pixel Smith/Cinematic_Lighting_v1.safetensors");
    const file = abs(done.dest);
    expect(new Uint8Array(await fs.readFile(file))).toEqual(o.fake.bytesOf(100111));
    const stem = file.replace(/\.safetensors$/, "");
    const info = JSON.parse(await fs.readFile(`${stem}.civitai.info`, "utf8"));
    expect(info).toMatchObject({
      id: 10011,
      modelId: 1001,
      model: { name: "Cinematic Lighting 1" },
    });
    expect((await fs.stat(`${stem}.preview.png`)).size).toBeGreaterThan(100);
    // The redirect to storage never carries the key, and nothing is left half-written.
    expect(o.fake.requests.some((r) => r.path.startsWith("/blobs/") && r.auth)).toBe(false);
    expect(await fs.readdir(path.dirname(file))).not.toContain(
      "Cinematic_Lighting_v1.safetensors.part",
    );
    const list = await o.services.models.list();
    expect(list.models.find((m) => m.id === done.dest)?.civitai).toMatchObject({
      modelId: 1001,
      versionId: 10011,
    });
    const page = await o.services.civitai.model(1001);
    expect(page.local?.versions).toContain(10011);
    expect(o.messages.some((m) => m.t === "models.changed")).toBe(true);
  });

  it("never overwrites: a taken name gets a free one", async () => {
    await o.services.settings.update(o.profileId, { civitai: { downloads: { folderBy: [] } } });
    const plan = await q().plan({ source: "civitai", modelId: 1011, versionId: 10111 });
    await fs.mkdir(path.dirname(plan.path), { recursive: true });
    await fs.writeFile(plan.path, "someone else's file");
    expect((await q().plan({ source: "civitai", modelId: 1011, versionId: 10111 })).nameTaken).toBe(
      true,
    );
    const d = await finished(
      (await q().enqueue({ source: "civitai", modelId: 1011, versionId: 10111 })).id,
    );
    expect(d.state).toBe("done");
    expect(d.dest).toMatch(/ \(2\)\.safetensors$/);
    expect(await fs.readFile(plan.path, "utf8")).toBe("someone else's file");
  });

  it("resumes a dropped download with a range request", async () => {
    const fileId = 100211; // model 1002, v1.0
    o.fake.failOnce(fileId);
    const d = await q().enqueue({ source: "civitai", modelId: 1002, versionId: 10021 });
    const failed = await finished(d.id);
    expect(failed.state).toBe("error");
    expect(failed.error).toMatch(/Resume/);
    await q().resume(d.id);
    const done = await waitFor(() => {
      const x = q()
        .snapshot()
        .items.find((i) => i.id === d.id);
      return x?.state === "done" ? x : null;
    });
    expect(o.fake.requests.some((r) => r.path === `/blobs/${fileId}` && r.range)).toBe(true);
    expect(new Uint8Array(await fs.readFile(abs(done.dest)))).toEqual(o.fake.bytesOf(fileId));
  });

  it("asks for the API key on early-access files and uses it once set", async () => {
    const d = await q().enqueue({ source: "civitai", modelId: 1003, versionId: 10033 });
    const failed = await finished(d.id);
    expect(failed.state).toBe("error");
    expect(failed.error).toMatch(/API key/);
    await o.services.civitai.setKey(FAKE_KEY, false);
    await q().resume(d.id);
    const done = await waitFor(() => {
      const x = q()
        .snapshot()
        .items.find((i) => i.id === d.id);
      return x?.state === "done" ? x : null;
    });
    expect(done.state).toBe("done");
    await o.services.civitai.removeKey();
  });

  it("refuses duplicates and types it can't place", async () => {
    await expect(
      q().plan({ source: "civitai", modelId: 1010, versionId: 10101 }),
    ).resolves.toMatchObject({
      blocked: expect.stringMatching(/Pick a folder/),
    });
    const ok = await q().plan({
      source: "civitai",
      modelId: 1010,
      versionId: 10101,
      kind: "checkpoints",
    });
    expect(ok.blocked).toBeNull();
  });

  it("cancels, removing the partial file", async () => {
    const d = await q().enqueue({ source: "civitai", modelId: 1005, versionId: 10052 });
    await q().cancel(d.id);
    const out = await finished(d.id);
    expect(out.state).toBe("cancelled");
    const part = `${abs(out.dest)}.part`;
    await expect(fs.stat(part)).rejects.toThrow();
  });

  it("keeps a history and restores unfinished downloads as paused", async () => {
    const page = q().history(0, 50);
    expect(page.total).toBeGreaterThanOrEqual(5);
    expect(page.items.some((i: Download) => i.state === "done")).toBe(true);
    // An unfinished row from an earlier run comes back paused.
    o.services.dbs
      .get(o.profileId)
      .db.prepare(
        `INSERT INTO downloads (id, source, name, dest, kind, size, received, state, error, created_at,
           started_at, finished_at, model_id, version_id, entry_id, thumb, job)
         VALUES ('old-one', 'civitai', 'Old', 'loras/old.safetensors', 'loras', 10, 0, 'running', NULL,
           1, NULL, NULL, 1006, 10061, NULL, NULL, '{"url":"x","civitaiAuth":true}')`,
      )
      .run();
    q().restore(o.profileId);
    expect(
      q()
        .snapshot()
        .items.find((i) => i.id === "old-one")?.state,
    ).toBe("paused");
  });
});

describe("Manager installs", () => {
  it("installs a catalog entry into its ComfyUI folder", async () => {
    const catalog = await o.services.catalog.catalog();
    const entry = catalog.entries.find((e) => e.filename === "face_yolo_fake.pt");
    expect(entry).toMatchObject({
      folder: "ultralytics/bbox",
      kind: "ultralytics",
      installed: false,
    });
    const d = await finished(
      (await q().enqueue({ source: "manager", entryId: entry?.id ?? "" })).id,
    );
    expect(d.state).toBe("done");
    expect(d.dest).toBe("ultralytics/bbox/face_yolo_fake.pt");
    expect(
      (await o.services.catalog.catalog()).entries.find((e) => e.id === entry?.id)?.installed,
    ).toBe(true);
    await expect(q().enqueue({ source: "manager", entryId: entry?.id ?? "" })).rejects.toThrow(
      /already installed/,
    );
  });

  it("explains gated files and custom node folders", async () => {
    const { entries } = await o.services.catalog.catalog();
    const gated = entries.find((e) => e.filename === "gated_model.safetensors");
    const d = await finished(
      (await q().enqueue({ source: "manager", entryId: gated?.id ?? "" })).id,
    );
    expect(d.error).toMatch(/login/);
    const custom = entries.find((e) => e.filename === "node_model.safetensors");
    expect(custom?.folder).toBeNull();
    expect((await q().plan({ source: "manager", entryId: custom?.id ?? "" })).blocked).toMatch(
      /ComfyUI Manager/,
    );
  });
});
