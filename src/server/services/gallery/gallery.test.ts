import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GalleryQuery } from "../../../shared/gallery.ts";
import type { ServerMessage } from "../../../shared/live.ts";
import type { LocalModel } from "../../../shared/models.ts";
import { createConfig, parseFlags } from "../../config.ts";
import { ProfileDbs } from "../../db/profileDb.ts";
import { realPng } from "../../lib/test-images.ts";
import type { AutocompleteService } from "../autocomplete.ts";
import type { CivitaiService } from "../civitai/index.ts";
import type { HistoryService } from "../history.ts";
import { ProfileService } from "../profiles.ts";
import { SettingsService } from "../settings.ts";
import { galleryHome, mostUsed } from "./home.ts";
import { ImportService, imageVersions, importName } from "./imports.ts";
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
  localModels: async () => localModels,
});
/** The models folder, as the Civitai image checks need it. */
let localModels: LocalModel[] = [];

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
            { name: "sd15/dreamshaper_8.safetensors", count: 3, recent: 1, images: 2 },
            { name: "gone.safetensors", count: 1, recent: 0, images: 2 },
          ]
        : kind === "lora"
          ? [{ name: "Detailer", count: 1, recent: 1, images: 3 }]
          : [{ name: "weather", count: 1, recent: 1, images: 3 }];
    const thumb = (await q({ q: "cozy cabin" })).items[0]?.thumb;
    const deps = {
      gallery,
      history: {
        usage,
        images: (kind: string) => (kind === "wildcard" ? [{ thumb }] : []),
      } as unknown as HistoryService,
      autocomplete: {
        usedTags: async () => [{ tag: "cozy_cabin", uses: 2 }],
      } as unknown as AutocompleteService,
    };
    const home = await galleryHome(deps, 4);
    expect(home.picks.map((i) => i.name).sort()).toEqual([
      "a1111.png",
      "plain.png",
      "sd15_00001_.png",
    ]);
    // A tag's images come from a search ("cozy_cabin" finds "a cozy cabin in the woods").
    expect(home.tags.top).toEqual([
      { name: "cozy_cabin", count: 2, recent: 0, total: 1, images: [thumb], filter: "cozy cabin" },
    ]);
    expect(home.models[0]).toMatchObject({ filter: "dreamshaper_8", images: [thumb] });
    // Nothing in the gallery was made with it: no images, no filter.
    expect(home.models[1]).toMatchObject({ images: [], filter: null });
    expect(home.loras[0]).toMatchObject({ filter: "Detailer", images: [expect.any(String)] });
    expect(home.wildcards[0]).toMatchObject({
      name: "weather",
      total: 3,
      images: [thumb],
      filter: null,
    });
    // Models and LoRAs count their images in the gallery.
    expect(home.models[0]).toMatchObject({ total: 1 });
    expect((await mostUsed(deps, "models", 4)).map((u) => u.filter)).toEqual([
      "dreamshaper_8",
      null,
    ]);
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

describe("stopped runs", () => {
  it("moves a stopped run's images into its workflow's interrupted folder", async () => {
    const day = "illustrious/images/2026-11-01";
    await write(`${day}/blombo_00001_.png`, await realPng(20, 20));
    await gallery.ingest(`${day}/blombo_00001_.png`);
    const refs = [{ filename: "blombo_00001_.png", subfolder: day, type: "output" }];
    await gallery.markInterrupted(profiles.active ?? "", refs);
    // The refs follow the file, so the job and its log point where it is now.
    expect(refs[0]).toMatchObject({ subfolder: "illustrious/interrupted/2026-11-01" });
    await fs.access(
      path.join(outputs, "illustrious", "interrupted", "2026-11-01", "blombo_00001_.png"),
    );
    const paths = async () => (await q({ limit: 1000 })).items.map((i) => i.path);
    expect((await paths()).some((p) => p.includes("blombo_00001_"))).toBe(false);
    const profileId = profiles.active ?? "";
    await settings.update(profileId, { gallery: { excludeInterrupted: false } });
    expect(await paths()).toContain("illustrious/interrupted/2026-11-01/blombo_00001_.png");
    await settings.update(profileId, { gallery: { excludeInterrupted: true } });
  });
});

describe("added images", () => {
  const imports = () =>
    new ImportService({
      gallery,
      civitai: {
        site: "https://civitai.com",
        imageToAdd: async () => civitaiRaw,
        images: { original: async () => ({ bytes: civitaiBytes, type: "image/png" }) },
        rawVersion: async (id: number) => {
          if (id === 200) throw new Error("not on Civitai");
          return { id, model: { name: `Civitai name ${id}` } };
        },
      } as unknown as CivitaiService,
    });
  const civitaiRaw = {
    id: 555,
    url: "https://image.civitai.com/acct/abc-123/original=true/555.png",
    username: "poster",
    postId: 9,
    modelVersionIds: [100],
    meta: {
      prompt: "a lighthouse at dusk",
      negativePrompt: "lowres",
      steps: 24,
      cfgScale: 6,
      seed: 31,
      Model: "someone's checkpoint",
      resources: [{ name: "their_lora_name", type: "lora", weight: 0.7 }],
      civitaiResources: [
        { type: "checkpoint", modelVersionId: 100 },
        { type: "lora", modelVersionId: 200, weight: 0.7 },
      ],
    },
  };
  let civitaiBytes: Uint8Array = new Uint8Array();

  it("adds a file from your PC once, into imported/", async () => {
    const bytes = await realPng(30, 20);
    const first = await imports().addFile(bytes, "C:\\pics\\my pic?.png");
    expect(first).toMatchObject({ already: false, image: { path: "imported/my pic_.png" } });
    expect(first.image.origin).toBe("imported");
    expect((await imports().addFile(bytes, "my pic?.png")).already).toBe(true);
    // Another file with the same name gets a free one.
    const other = await imports().addFile(await realPng(31, 20), "my pic?.png");
    expect(other.image.path).toBe("imported/my pic_ (2).png");
    await expect(
      imports().addFile(new TextEncoder().encode("hello"), "x.png"),
    ).rejects.toMatchObject({ status: 415 });
  });

  it("adds a Civitai image with its sidecar, found through the models you have", async () => {
    civitaiBytes = await realPng(40, 60);
    const body = { versionId: 300, key: "abc-123", id: 555 };
    const added = await imports().addCivitai(body);
    expect(added).toMatchObject({ already: false, image: { path: "civitai/abc-123.png" } });
    expect(added.image.origin).toBe("civitai");
    const sidecar = JSON.parse(
      await fs.readFile(path.join(outputs, "civitai", "abc-123.png.civitai.json"), "utf8"),
    );
    expect(sidecar).toMatchObject({ imageId: 555, by: "poster", versionId: 300 });
    expect(sidecar.versions).toEqual([300, 100, 200]);
    expect((await imports().addCivitai(body)).already).toBe(true);

    // How it was made comes from the sidecar (the file has nothing).
    const d = await gallery.details(added.image.id);
    expect(d.summary).toMatchObject({
      source: "civitai",
      prompt: "a lighthouse at dusk",
      seed: 31,
    });
    expect(d.civitai).toEqual({
      by: "poster",
      page: "https://civitai.com/images/555",
      versionId: 300,
    });

    // The poster's names never show; the LoRA shows once a local model is that version.
    let facets = await gallery.facets("all");
    expect(facets.loras.map((l) => l.name)).not.toContain("their_lora_name");
    expect(facets.models.map((m) => m.name)).not.toContain("someone's checkpoint");
    expect((await q({ lora: "my_lora" })).total).toBe(0);
    localModels = [
      { id: "loras/style/my_lora.safetensors", kind: "loras", civitai: { versionId: 200 } },
      { id: "checkpoints/mine.safetensors", kind: "checkpoints", civitai: { versionId: 100 } },
    ] as unknown as LocalModel[];
    facets = await gallery.facets("all");
    expect(facets.loras).toContainEqual({ name: "my_lora", count: 1 });
    expect(facets.models).toContainEqual({ name: "mine", count: 1 });
    expect((await q({ lora: "my_lora" })).items.map((i) => i.path)).toEqual([
      "civitai/abc-123.png",
    ]);
    expect((await q({ model: "mine" })).total).toBe(1);
    localModels = [];
  });

  it("names the models a Civitai generator graph gives only as AIRs", async () => {
    // What Civitai's generator writes: models as urn:air ids, its own record beside the nodes.
    const graph = {
      "1": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "urn:air:sdxl:checkpoint:civitai:10@100" },
      },
      "2": {
        class_type: "LoraLoader",
        inputs: {
          lora_name: "urn:air:sdxl:lora:civitai:20@200",
          strength_model: 0.7,
          model: ["1", 0],
          clip: ["1", 1],
        },
      },
      "3": {
        class_type: "KSampler",
        inputs: { seed: 1, steps: 20, cfg: 5, model: ["2", 0], positive: ["4", 0] },
      },
      "4": { class_type: "CLIPTextEncode", inputs: { text: "a fox", clip: ["2", 1] } },
      extraMetadata: JSON.stringify({ prompt: "a fox", negativePrompt: "lowres" }),
    };
    civitaiBytes = await realPng(40, 60, { prompt: JSON.stringify(graph) });
    const body = { versionId: 300, key: "gen-1", id: 555 };
    const added = await imports().addCivitai(body);
    const sidecar = JSON.parse(
      await fs.readFile(path.join(outputs, "civitai", "gen-1.png.civitai.json"), "utf8"),
    );
    expect(sidecar.names).toEqual({ "100": "Civitai name 100", "300": "Civitai name 300" });
    let d = await gallery.details(added.image.id);
    expect(d.summary).toMatchObject({
      source: "civitai",
      prompt: "a fox",
      model: "Civitai name 100",
    });
    expect(d.summary.loras).toEqual([{ name: "Civitai model 20", strength: 0.7 }]);

    // A local model that is the version names it (adding it again reads the image again).
    localModels = [
      { id: "loras/style/my_lora.safetensors", kind: "loras", civitai: { versionId: 200 } },
    ] as unknown as LocalModel[];
    await imports().addCivitai(body);
    d = await gallery.details(added.image.id);
    expect(d.summary.loras).toEqual([{ name: "my_lora", strength: 0.7 }]);
    localModels = [];
  });

  it("shows or hides each origin", async () => {
    const origins = async (o: string) =>
      new Set((await q({ origins: o, limit: 1000 })).items.map((i) => i.origin));
    expect(await origins("civitai")).toEqual(new Set(["civitai"]));
    expect(await origins("generated,imported")).toEqual(new Set(["generated", "imported"]));
    expect((await q({ origins: "" })).total).toBe(0);
    const all = (await q({ limit: 1000 })).total;
    expect(all).toBe(
      (await q({ origins: "generated" })).total +
        (await q({ origins: "imported" })).total +
        (await q({ origins: "civitai" })).total,
    );
  });

  it("takes a Civitai image's sidecar along to the trash and back", async () => {
    const image = (await q({ origins: "civitai" })).items.find((i) => i.name === "abc-123.png");
    if (!image) throw new Error("not found");
    const [trashId] = await gallery.trash([image.id]);
    const sidecar = path.join(outputs, "civitai", "abc-123.png.civitai.json");
    await expect(fs.access(sidecar)).rejects.toThrow();
    await gallery.restore([trashId as string]);
    await fs.access(sidecar);
    const back = (await q({ origins: "civitai" })).items.find((i) => i.name === "abc-123.png");
    expect((await gallery.details(back?.id ?? 0)).summary.source).toBe("civitai");
  });

  it("names files safely and lists an image's versions", () => {
    expect(importName("a/b\\c:d.JPG", "image/jpeg")).toBe("c_d.jpg");
    expect(importName("photo.png", "image/webp")).toBe("photo.png.webp");
    expect(importName("CON.png", "image/png")).toBe("CON_.png");
    expect(importName("...", "image/png")).toBe("image.png");
    expect(
      imageVersions(5, {
        modelVersionIds: [5, 6],
        meta: { civitaiResources: [{ modelVersionId: 7 }, {}] },
      }),
    ).toEqual([5, 6, 7]);
  });
});

describe("animations, videos and audio", () => {
  const u32 = (n: number, little = false) => {
    const b = Buffer.alloc(4);
    if (little) b.writeUInt32LE(n);
    else b.writeUInt32BE(n);
    return b;
  };
  const box = (type: string, ...body: Buffer[]) => {
    const inner = Buffer.concat(body);
    return Buffer.concat([u32(8 + inner.length), Buffer.from(type, "latin1"), inner]);
  };

  it("indexes each kind with its length, and makes their thumbnails", async () => {
    const frame = (c: string) =>
      sharp({ create: { width: 30, height: 20, channels: 3, background: c } })
        .png()
        .toBuffer();
    const gif = await sharp([await frame("#f00"), await frame("#00f")], {
      join: { animated: true },
    })
      .gif({ delay: [500, 700] })
      .toBuffer();
    await write("anims/loop.gif", new Uint8Array(gif));
    const mp4 = Buffer.concat([
      box("ftyp", Buffer.from("isom"), u32(0)),
      box(
        "moov",
        box("mvhd", Buffer.alloc(4), u32(0), u32(0), u32(600), u32(1800)),
        box("trak", box("tkhd", Buffer.alloc(76), u32(640 * 65536), u32(360 * 65536))),
      ),
    ]);
    await write("anims/clip.mp4", new Uint8Array(mp4));
    const wav = Buffer.concat([
      Buffer.from("RIFF"),
      u32(0, true),
      Buffer.from("WAVE"),
      Buffer.from("fmt "),
      u32(16, true),
      Buffer.alloc(8),
      u32(1000, true),
      Buffer.alloc(4),
      Buffer.from("data"),
      u32(4000, true),
      Buffer.alloc(4000),
    ]);
    await write("anims/sound.wav", new Uint8Array(wav));
    gallery.startSync();
    await gallery.whenSynced();

    const items = (await q({ q: "anims", limit: 1000 })).items;
    const by = (name: string) => items.find((i) => i.name === name);
    expect(by("loop.gif")).toMatchObject({
      media: "animated",
      width: 30,
      height: 20,
      duration: 1.2,
    });
    expect(by("clip.mp4")).toMatchObject({ media: "video", width: 640, height: 360, duration: 3 });
    expect(by("sound.wav")).toMatchObject({ media: "audio", duration: 4 });

    // Thumbnails: the animation moves (two frames), the others get a picture either way.
    const moving = await gallery.thumbFile(by("loop.gif")?.id ?? 0, true);
    expect((await sharp(moving, { animated: true }).metadata()).pages).toBe(2);
    const still = await gallery.thumbFile(by("loop.gif")?.id ?? 0);
    expect((await sharp(still).metadata()).pages ?? 1).toBe(1);
    for (const name of ["clip.mp4", "sound.wav"]) {
      const thumb = await gallery.thumbFile(by(name)?.id ?? 0);
      expect((await sharp(thumb).metadata()).format).toBe("webp");
    }
  });
});
