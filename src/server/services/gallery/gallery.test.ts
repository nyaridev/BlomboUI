import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GalleryQuery } from "../../../shared/gallery.ts";
import type { ServerMessage } from "../../../shared/live.ts";
import { createConfig, parseFlags } from "../../config.ts";
import { ProfileDbs } from "../../db/profileDb.ts";
import { realPng } from "../../lib/test-images.ts";
import type { AutocompleteService } from "../autocomplete.ts";
import type { HistoryService } from "../history.ts";
import { ProfileService } from "../profiles.ts";
import { SettingsService } from "../settings.ts";
import { galleryHome } from "./home.ts";
import { ftsQuery, GalleryService } from "./index.ts";

/** A header read of a file named in `held` finishes, then waits until the test lets it go. */
const held = new Map<string, { reached: () => void; release: Promise<void> }>();
vi.mock("../../lib/imagemeta.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/imagemeta.ts")>();
  return {
    ...real,
    readImageHead: async (abs: string) => {
      const head = await real.readImageHead(abs);
      const gate = held.get(path.basename(abs));
      if (gate) {
        gate.reached();
        await gate.release;
      }
      return head;
    },
  };
});

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-gallery-"));
const outputs = path.join(tmp, "outputs");
const extra = path.join(tmp, "extra");
const config = createConfig(
  parseFlags(["--data", path.join(tmp, "data"), "--runtime", path.join(tmp, "runtime")]),
);
const graph = await fs.readFile(
  new URL("../workflows/fixtures/sd15-api.json", import.meta.url),
  "utf8",
);

const messages: ServerMessage[] = [];
const profiles = new ProfileService(config);
const settings = new SettingsService((id) => profiles.dir(id));
const gallery = new GalleryService({
  profiles,
  dbs: new ProfileDbs((id) => path.join(profiles.dir(id), "blombo.sqlite")),
  settings,
  runtimeDir: config.runtimeDir,
  publish: (_topic, msg) => messages.push(msg),
  workflowExists: async (id) => id === "sd15",
});

const q = (input: Record<string, unknown> = {}) => gallery.query(GalleryQuery.parse(input));

async function write(rel: string, bytes: Uint8Array, root = outputs) {
  const file = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, bytes);
  return file;
}

beforeAll(async () => {
  await write(
    "2026-10-15/sd15_00001_.png",
    await realPng(64, 96, {
      prompt: graph,
      blombo: JSON.stringify({
        workflow: "sd15",
        name: "SD 1.5",
        seed: 777,
        values: { "prompt.positive": "a cozy cabin, __weather__" },
        prompts: { "prompt.positive": "a cozy cabin in the woods, light rain" },
      }),
    }),
  );
  await write(
    "a1111.png",
    await realPng(80, 80, {
      parameters:
        "silver hair, <lora:Detailer:0.8>\nNegative prompt: bad hands\nSteps: 20, Sampler: Euler a, CFG scale: 6, Seed: 5, Size: 80x80, Model: waiIllustrious_v14",
    }),
  );
  await write("sub/plain.png", await realPng(32, 16));
  await write("notes.txt", new TextEncoder().encode("not an image"));
  await fs.mkdir(extra, { recursive: true });
  const profile = await profiles.create({
    name: "Gallery test",
    accent: "blue",
    theme: "blombo",
    paths: { models: "", outputs, wildcards: "" },
    comfy: { mode: "external", url: "http://127.0.0.1:1" },
    presets: [],
  });
  await profiles.open(profile.id);
  await gallery.open(profile.id);
  gallery.startSync();
  await gallery.whenSynced();
});

afterAll(async () => {
  await gallery.close();
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("gallery index", () => {
  it("indexes images with their metadata and skips other files", async () => {
    const page = await q();
    expect(page.total).toBe(3);
    expect(page.items.map((i) => i.path).sort()).toEqual([
      "2026-10-15/sd15_00001_.png",
      "a1111.png",
      "sub/plain.png",
    ]);
    const comfy = page.items.find((i) => i.name === "sd15_00001_.png");
    expect(comfy).toMatchObject({ width: 64, height: 96, model: "dreamshaper_8", favorite: false });
    expect(comfy?.thumb).toMatch(/^\/api\/gallery\/thumbs\/\d+\?v=/);
    const overview = await gallery.overview();
    expect(overview.counts.all).toBe(3);
    expect(overview.libraries[0]).toMatchObject({ id: "outputs", count: 3, exists: true });
    expect(overview.sync).toMatchObject({ running: false, error: null });
    expect(overview.perDay).toHaveLength(7);
    expect(overview.perDay[6]).toBe(3); // written just now
  });

  it("reads Blombo, ComfyUI and A1111 details", async () => {
    const comfy = (await q({ q: "cabin" })).items[0];
    if (!comfy) throw new Error("not found");
    const d = await gallery.details(comfy.id);
    expect(d.summary).toMatchObject({
      source: "blombo",
      prompt: "a cozy cabin in the woods, light rain",
      negative: "blurry, lowres",
      seed: 777,
      steps: 25,
      sampler: "dpmpp_2m",
      workflow: "SD 1.5",
    });
    expect(d.settings.workflowId).toBe("sd15");
    expect(d.settings.roles["sampler.cfg"]).toBe(7);
    expect(d.hasWorkflow).toBe(true);

    const a = (await q({ q: "silver" })).items[0];
    if (!a) throw new Error("not found");
    const ad = await gallery.details(a.id);
    expect(ad.summary).toMatchObject({ source: "a1111", model: "waiIllustrious_v14", seed: 5 });
    expect(ad.summary.loras).toEqual([{ name: "Detailer", strength: 0.8 }]);
  });

  it("searches, filters and sorts", async () => {
    expect((await q({ q: "bad hands" })).items.map((i) => i.name)).toEqual(["a1111.png"]);
    expect((await q({ q: "zzz-nothing" })).total).toBe(0);
    expect((await q({ q: "pl" })).items.map((i) => i.name)).toEqual(["plain.png"]); // short term → LIKE
    expect((await q({ lora: "Detailer" })).items.map((i) => i.name)).toEqual(["a1111.png"]);
    expect((await q({ model: "dreamshaper_8" })).total).toBe(1);
    expect((await q({ sort: "name" })).items.map((i) => i.name)).toEqual([
      "a1111.png",
      "plain.png",
      "sd15_00001_.png",
    ]);
    expect((await q({ limit: 2 })).items).toHaveLength(2);
    const facets = await gallery.facets("all");
    expect(facets.models.map((m) => m.name).sort()).toEqual([
      "dreamshaper_8",
      "waiIllustrious_v14",
    ]);
    expect(facets.loras).toEqual([{ name: "Detailer", count: 1 }]);
  });

  it("shuffles in one order per seed, and builds Home with images for what runs used", async () => {
    const names = async (seed: number) =>
      (await q({ sort: "random", seed })).items.map((i) => i.name);
    expect(await names(4)).toEqual(await names(4));
    expect((await names(4)).sort()).toEqual(["a1111.png", "plain.png", "sd15_00001_.png"]);

    const usage = (kind: string) =>
      kind === "model"
        ? [
            { name: "sd15/dreamshaper_8.safetensors", count: 3, recent: 1 },
            { name: "gone.safetensors", count: 1, recent: 0 },
          ]
        : kind === "lora"
          ? [{ name: "Detailer", count: 1, recent: 1 }]
          : [{ name: "weather", count: 1, recent: 1 }];
    const thumb = (await q({ q: "cozy cabin" })).items[0]?.thumb;
    const home = await galleryHome(
      {
        gallery,
        history: {
          usage,
          images: (kind: string) => (kind === "wildcard" ? [{ thumb }] : []),
        } as unknown as HistoryService,
        autocomplete: {
          usedTags: async () => [{ tag: "cozy_cabin", uses: 2 }],
        } as unknown as AutocompleteService,
      },
      4,
    );
    expect(home.picks.map((i) => i.name).sort()).toEqual([
      "a1111.png",
      "plain.png",
      "sd15_00001_.png",
    ]);
    // A tag's images come from a search ("cozy_cabin" finds "a cozy cabin in the woods").
    expect(home.tags.top).toEqual([{ tag: "cozy_cabin", uses: 2, images: [thumb] }]);
    expect(home.models[0]).toMatchObject({ filter: "dreamshaper_8", images: [thumb] });
    // Nothing in the gallery was made with it: no images, no filter.
    expect(home.models[1]).toMatchObject({ images: [], filter: null });
    expect(home.loras[0]).toMatchObject({ filter: "Detailer", images: [expect.any(String)] });
    expect(home.wildcards[0]).toMatchObject({ name: "weather", images: [thumb], filter: null });
  });

  it("builds FTS queries only from terms trigram can match", () => {
    expect(ftsQuery(["ab", 'say "hi"'])).toBe('"say ""hi"""');
    expect(ftsQuery(["ab"])).toBeNull();
  });

  it("keeps favorites", async () => {
    const plain = (await q({ q: "plain" })).items[0];
    if (!plain) throw new Error("not found");
    gallery.setFavorite([plain.id], true);
    expect((await q({ favorites: "1" })).items.map((i) => i.name)).toEqual(["plain.png"]);
    expect(messages.some((m) => m.t === "gallery.changed")).toBe(true);
  });

  it("makes a WebP thumbnail", async () => {
    const plain = (await q({ q: "plain" })).items[0];
    if (!plain) throw new Error("not found");
    const file = await gallery.thumbFile(plain.id);
    const bytes = await fs.readFile(file);
    expect(bytes.subarray(8, 12).toString("latin1")).toBe("WEBP");
    expect(file.startsWith(path.join(config.runtimeDir, "cache"))).toBe(true);
  });

  it("moves images to the trash and restores them with their favorite", async () => {
    const plain = (await q({ q: "plain" })).items[0];
    if (!plain) throw new Error("not found");
    expect(await gallery.trash([plain.id])).toHaveLength(1);
    await expect(fs.access(path.join(outputs, "sub", "plain.png"))).rejects.toThrow();
    expect((await q()).total).toBe(2);
    const trash = gallery.trashList();
    expect(trash).toHaveLength(1);
    expect(trash[0]).toMatchObject({ path: "sub/plain.png", name: "plain.png" });
    expect(await gallery.restore([trash[0]?.id ?? ""])).toBe(1);
    await fs.access(path.join(outputs, "sub", "plain.png"));
    expect((await q({ favorites: "1" })).items.map((i) => i.name)).toEqual(["plain.png"]);
    expect(gallery.trashList()).toHaveLength(0);
  });

  it("doesn't bring back an image trashed while a sync reads it", async () => {
    await write("racy.png", await realPng(24, 24));
    let reached = () => {};
    const atRead = new Promise<void>((resolve) => {
      reached = resolve;
    });
    let release = () => {};
    held.set("racy.png", {
      reached: () => reached(),
      release: new Promise<void>((resolve) => {
        release = resolve;
      }),
    });
    try {
      gallery.startSync();
      await atRead;
      // The sync has read racy.png's header and not written it yet. Index it the way a finished
      // job would, trash it, then let the sync's batch write.
      held.delete("racy.png");
      await gallery.ingestOutput({ filename: "racy.png", subfolder: "", type: "output" });
      const row = (await q({ q: "racy" })).items[0];
      if (!row) throw new Error("not indexed");
      expect(await gallery.trash([row.id])).toHaveLength(1);
      release();
      await gallery.whenSynced();
      expect((await q({ q: "racy" })).total).toBe(0);
    } finally {
      held.delete("racy.png");
      release();
    }
    const entry = gallery.trashList().find((t) => t.name === "racy.png");
    await gallery.emptyTrash(entry ? [entry.id] : []);
  });

  it("rates, tags and collects images, and keeps it all through the trash", async () => {
    const plain = (await q({ q: "plain" })).items[0];
    const other = (await q({ q: "silver" })).items[0];
    if (!plain || !other) throw new Error("not found");
    gallery.setRating([plain.id], 4);
    gallery.setRating([other.id], 2);
    gallery.setTags([plain.id, other.id], ["keeper", "Best Of"], []);
    gallery.setTags([other.id], [], ["keeper"]);
    const album = gallery.createCollection("Portfolio");
    expect(album.id).toBe("portfolio");
    expect(gallery.setCollectionItems(album.id, [plain.id], false)).toBe(1);

    expect((await q({ rating: 3 })).items.map((i) => i.name)).toEqual(["plain.png"]);
    expect((await q({ sort: "rating" })).items[0]).toMatchObject({ name: "plain.png", rating: 4 });
    expect((await q({ tag: "keeper" })).items.map((i) => i.name)).toEqual(["plain.png"]);
    expect(gallery.tags()).toEqual([
      { tag: "Best Of", count: 2 },
      { tag: "keeper", count: 1 },
    ]);
    expect((await q({ collection: album.id })).items.map((i) => i.name)).toEqual(["plain.png"]);
    expect(gallery.collections()[0]).toMatchObject({ name: "Portfolio", count: 1 });
    const details = await gallery.details(plain.id);
    expect(details).toMatchObject({
      rating: 4,
      tags: ["Best Of", "keeper"],
      collections: ["portfolio"],
    });

    const [trashId] = await gallery.trash([plain.id]);
    expect(gallery.collections()[0]?.count).toBe(0);
    await gallery.restore([trashId as string]);
    const back = (await q({ q: "plain" })).items[0];
    expect(back).toMatchObject({ rating: 4, favorite: true });
    expect(await gallery.details(back?.id as number)).toMatchObject({
      tags: ["Best Of", "keeper"],
      collections: ["portfolio"],
    });
    gallery.removeCollection(album.id);
    expect(gallery.collections()).toEqual([]);
    expect((await q()).total).toBe(3);
  });

  it("empties only its own trash folder", async () => {
    const plain = (await q({ q: "plain" })).items[0];
    if (!plain) throw new Error("not found");
    await gallery.trash([plain.id]);
    expect(await gallery.emptyTrash()).toBe(1);
    expect(gallery.trashList()).toHaveLength(0);
    await write("sub/plain.png", await realPng(32, 16));
  });

  it("indexes a job's new image as it lands", async () => {
    await write("2026-10-15/sd15_00002_.png", await realPng(48, 48, { prompt: graph }));
    const image = await gallery.ingestOutput({
      filename: "sd15_00002_.png",
      subfolder: "2026-10-15",
      type: "output",
    });
    expect(image).toMatchObject({ name: "sd15_00002_.png", width: 48 });
    expect(messages.some((m) => m.t === "gallery.added")).toBe(true);
    expect(
      await gallery.ingestOutput({ filename: "x.png", subfolder: "", type: "temp" }),
    ).toBeNull();
    expect(
      await gallery.ingestOutput({ filename: "x.png", subfolder: "../..", type: "output" }),
    ).toBeNull();
  });

  it("drops rows for deleted files on the next sync and adds libraries", async () => {
    await fs.rm(path.join(outputs, "a1111.png"));
    await write("in-extra.png", await realPng(20, 20), extra);
    const lib = await gallery.addLibrary("Extra stuff", extra);
    expect(lib.id).toBe("extra-stuff");
    gallery.startSync(); // context.ts does this when the profile's output folders change
    await gallery.whenSynced();
    expect((await q({ library: "outputs" })).items.map((i) => i.name)).not.toContain("a1111.png");
    expect((await q({ library: "extra-stuff" })).items.map((i) => i.name)).toEqual([
      "in-extra.png",
    ]);
    await expect(gallery.addLibrary("Again", extra)).rejects.toThrow(/already/);
    await gallery.removeLibrary(lib.id);
    expect((await q({ library: "extra-stuff" })).total).toBe(0);
    await fs.access(path.join(extra, "in-extra.png"));
  });

  it("leaves out grids and stopped runs' images while the settings say so", async () => {
    const profileId = profiles.active ?? "";
    const names = async () => (await q()).items.map((i) => i.name);
    await write("2026-10-16/stopped_00001_.png", await realPng(40, 40));
    await write("txt2img-grids/old-grid.png", await realPng(40, 40));
    await write("2026-10-16/grids/grid-00001.png", await realPng(40, 40));
    messages.length = 0;
    await gallery.ingestOutput({
      filename: "grid-00001.png",
      subfolder: "2026-10-16/grids",
      type: "output",
    });
    expect(messages.some((m) => m.t === "gallery.added")).toBe(false);
    gallery.startSync();
    await gallery.whenSynced();
    await gallery.markInterrupted(profileId, [
      { filename: "stopped_00001_.png", subfolder: "2026-10-16", type: "output" },
    ]);
    expect(messages.some((m) => m.t === "gallery.changed")).toBe(true);

    const shown = await names();
    for (const hidden of ["grid-00001.png", "old-grid.png", "stopped_00001_.png"])
      expect(shown).not.toContain(hidden);
    expect((await gallery.overview()).counts.all).toBe(shown.length);

    await settings.update(profileId, { gallery: { excludeGrids: false } });
    expect(await names()).toEqual(expect.arrayContaining(["grid-00001.png", "old-grid.png"]));
    expect(await names()).not.toContain("stopped_00001_.png");
    await settings.update(profileId, { gallery: { excludeInterrupted: false } });
    expect(await names()).toContain("stopped_00001_.png");
    await settings.update(profileId, { gallery: { excludeGrids: true, excludeInterrupted: true } });

    // A newer image written at a marked path is a different image: it shows.
    const later = new Date(Date.now() + 60_000);
    await fs.utimes(path.join(outputs, "2026-10-16", "stopped_00001_.png"), later, later);
    gallery.startSync();
    await gallery.whenSynced();
    expect(await names()).toContain("stopped_00001_.png");
  });
});
