/**
 * Gallery benchmark. Makes a throwaway library of small ComfyUI-style PNGs (each with an API
 * prompt graph in a tEXt chunk, spread over 60 days of folders) and measures the gallery through
 * the real routes, in-process: the first index, a resync with nothing changed, list and search
 * latency, thumbnails cold and warm, event-loop delay while indexing, and memory.
 *
 *   node tools/bench-gallery.ts [--images 20000] [--dir runtime/bench-gallery] [--keep]
 *
 * Everything lives in --dir (its own data/, runtime/ and outputs/); real profiles are never
 * touched and nothing is fetched from the internet. With --keep the folder stays, so a dev
 * instance can open the same gallery to check scrolling in the browser:
 *
 *   node src/server/main.ts --dev --port 4391 --data <dir>/data --runtime <dir>/runtime
 */
import fs from "node:fs/promises";
import path from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { crc32 } from "node:zlib";
import sharp from "sharp";
import { createApp } from "../src/server/app.ts";
import { createConfig } from "../src/server/config.ts";
import { createServices } from "../src/server/context.ts";
import { rng } from "../src/shared/random.ts";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const COUNT = Number(flag("--images") ?? 20000);
const KEEP = args.includes("--keep");
const root = path.resolve(import.meta.dirname, "..");
const dir = path.resolve(flag("--dir") ?? path.join(root, "runtime", "bench-gallery"));
const outputs = path.join(dir, "outputs");
const DEAD = "http://127.0.0.1:9"; // nothing listens: no ComfyUI, no Civitai

/* ── the library ────────────────────────────────────────────────────────── */

const SUBJECTS = [
  "a cozy reading nook",
  "a lighthouse at dusk",
  "portrait of a knight",
  "a neon street market",
  "a mountain lake",
  "a red fox in snow",
  "an old wooden ship",
  "a desert caravan",
  "a crystal cave",
  "a robot gardener",
  "a rainy tokyo alley",
  "a castle on a cliff",
  "a field of sunflowers",
  "an astronaut on mars",
  "a cat on a windowsill",
];
const DETAILS = [
  "warm lamp light",
  "volumetric fog",
  "golden hour",
  "cinematic lighting",
  "soft focus background",
  "highly detailed",
  "film grain",
  "rim light",
  "watercolor",
  "oil painting",
  "35mm photo",
  "bokeh",
  "dramatic clouds",
  "pastel colors",
  "ultra wide",
];
const CHECKPOINTS = [
  "v1-5-pruned-emaonly.safetensors",
  "dreamshaper_8.safetensors",
  "sdxl_base_1.0.safetensors",
  "juggernautXL_v9.safetensors",
  "illustriousXL_v01.safetensors",
  "realisticVision_v51.safetensors",
];
const SIZES: Array<[number, number]> = [
  [64, 96],
  [96, 64],
  [80, 80],
  [72, 108],
];

function textChunk(key: string, value: string): Buffer {
  const body = Buffer.from(`${key}\0${value}`, "latin1");
  const out = Buffer.alloc(12 + body.byteLength);
  out.writeUInt32BE(body.byteLength, 0);
  out.write("tEXt", 4, "latin1");
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.byteLength)) >>> 0, 8 + body.byteLength);
  return out;
}

function graph(r: () => number, i: number) {
  const pick = <T>(list: T[]) => list[Math.floor(r() * list.length)] as T;
  const prompt = [pick(SUBJECTS), pick(DETAILS), pick(DETAILS), pick(DETAILS)].join(", ");
  return {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: pick(CHECKPOINTS) } },
    "3": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["1", 1] } },
    "4": { class_type: "CLIPTextEncode", inputs: { text: "lowres, blurry", clip: ["1", 1] } },
    "5": { class_type: "EmptyLatentImage", inputs: { width: 512, height: 768, batch_size: 1 } },
    "6": {
      class_type: "KSampler",
      inputs: {
        seed: 1000 + i,
        steps: 20 + (i % 10),
        cfg: 7,
        sampler_name: "dpmpp_2m",
        scheduler: "karras",
        denoise: 1,
        model: ["1", 0],
        positive: ["3", 0],
        negative: ["4", 0],
        latent_image: ["5", 0],
      },
    },
    "7": { class_type: "VAEDecode", inputs: { samples: ["6", 0], vae: ["1", 2] } },
    "8": { class_type: "SaveImage", inputs: { filename_prefix: "ComfyUI", images: ["7", 0] } },
  };
}

async function makeLibrary(): Promise<number> {
  const marker = path.join(dir, `library-${COUNT}.done`);
  if (await fs.stat(marker).catch(() => null)) return 0;
  await fs.rm(outputs, { recursive: true, force: true });
  const bases: Buffer[] = [];
  for (let c = 0; c < 12; c++) {
    const [width, height] = SIZES[c % SIZES.length] as [number, number];
    const background = { r: (c * 53) % 256, g: (c * 97) % 256, b: (c * 151) % 256 };
    bases.push(
      await sharp({ create: { width, height, channels: 3, background } })
        .png()
        .toBuffer(),
    );
  }
  const r = rng(42);
  const now = Date.now();
  const started = performance.now();
  for (let i = 0; i < COUNT; i++) {
    const day = Math.floor((i / COUNT) * 60);
    const when = now - day * 86_400_000 - (i % 300) * 60_000;
    const folder = new Date(when).toISOString().slice(0, 10);
    const base = bases[i % bases.length] as Buffer;
    const file = Buffer.concat([
      base.subarray(0, 33), // signature + IHDR
      textChunk("prompt", JSON.stringify(graph(r, i))),
      base.subarray(33),
    ]);
    const abs = path.join(outputs, folder, `ComfyUI_${String(i).padStart(5, "0")}_.png`);
    if (i === 0 || !(await fs.stat(path.dirname(abs)).catch(() => null)))
      await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, file);
    await fs.utimes(abs, when / 1000, when / 1000);
  }
  await fs.writeFile(marker, "");
  return performance.now() - started;
}

/* ── measuring ──────────────────────────────────────────────────────────── */

const ms = (n: number) => `${n < 10 ? n.toFixed(1) : Math.round(n)} ms`;
const mb = (n: number) => `${Math.round(n / 1048576)} MB`;
const sleep = (t: number) => new Promise((r) => setTimeout(r, t));

function stats(times: number[]) {
  const s = [...times].sort((a, b) => a - b);
  return {
    median: s[Math.floor(s.length / 2)] ?? 0,
    p95: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] ?? 0,
  };
}

/** Only ever clear a folder this tool made (it carries a marker file). */
async function claimDir(): Promise<void> {
  const marker = path.join(dir, ".blombo-bench");
  const entries = await fs.readdir(dir).catch(() => null);
  if (entries?.length && !entries.includes(".blombo-bench"))
    throw new Error(`${dir} isn't empty and wasn't made by this tool. Pick another --dir.`);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(marker, "");
}

async function main() {
  await claimDir();
  console.log(`Library: ${COUNT} images in ${outputs}`);
  const made = await makeLibrary();
  if (made) console.log(`  generated in ${ms(made)}`);

  const config = createConfig({
    dev: true,
    port: 4399,
    open: "none",
    dataDir: path.join(dir, "data"),
    runtimeDir: path.join(dir, "runtime"),
    civitaiUrl: DEAD,
    catalogUrl: `${DEAD}/model-list.json`,
  });
  const services = createServices(config);
  const app = createApp(services);
  const call = async (url: string, init?: RequestInit) => {
    const res = await app.request(url, init);
    if (!res.ok) throw new Error(`${url}: ${res.status} ${await res.text()}`);
    return res;
  };
  const json = async <T>(url: string, init?: RequestInit) =>
    (await (await call(url, init)).json()) as T;
  const post = (url: string, body: unknown) =>
    json(url, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });

  // A fresh index each run: drop the profile and caches, keep the library.
  await fs.rm(path.join(dir, "data"), { recursive: true, force: true });
  await fs.rm(path.join(dir, "runtime"), { recursive: true, force: true });
  const profile = (await post("/api/profiles", {
    name: "Bench",
    paths: { outputs, models: "", wildcards: "" },
    comfy: { mode: "external", url: DEAD },
  })) as { id: string };

  const rows: Array<[string, string]> = [];
  const mem0 = process.memoryUsage();

  // First index, with the event loop watched and a request every 50 ms.
  const loop = monitorEventLoopDelay({ resolution: 5 });
  loop.enable();
  const during: number[] = [];
  let indexing = true;
  const pinger = (async () => {
    while (indexing) {
      const t = performance.now();
      await call("/api/system");
      during.push(performance.now() - t);
      await sleep(50);
    }
  })();
  let t = performance.now();
  await post(`/api/profiles/${profile.id}/open`, {});
  while (!services.gallery.sync.finishedAt) await sleep(20);
  const first = performance.now() - t;
  indexing = false;
  await pinger;
  loop.disable();
  const total = services.gallery.sync.done;
  rows.push([
    "First index",
    `${ms(first)} for ${total} files (${Math.round(total / (first / 1000))} files/s)`,
  ]);
  rows.push([
    "Event loop delay while indexing",
    `p99 ${ms(loop.percentile(99) / 1e6)}, max ${ms(loop.max / 1e6)}`,
  ]);
  rows.push([
    "Other requests while indexing",
    `median ${ms(stats(during).median)}, p95 ${ms(stats(during).p95)}, max ${ms(Math.max(...during))}`,
  ]);

  t = performance.now();
  services.gallery.startSync();
  await services.gallery.whenSynced();
  rows.push(["Resync, nothing changed", ms(performance.now() - t)]);

  const queries: Array<[string, string]> = [
    ["First page (300, newest)", "/api/gallery/images?limit=300"],
    ["Deep page (offset 19,000)", "/api/gallery/images?limit=300&offset=19000"],
    ["Sort by name", "/api/gallery/images?limit=300&sort=name"],
    ["Search, one word (FTS)", "/api/gallery/images?limit=300&q=lighthouse"],
    ["Search, two words (FTS)", "/api/gallery/images?limit=300&q=rainy%20tokyo"],
    ["Search, rare word", "/api/gallery/images?limit=300&q=astronaut%20pastel%20grain"],
    ["Search, short term (LIKE)", "/api/gallery/images?limit=300&q=ox"],
    ["Model filter", "/api/gallery/images?limit=300&model=dreamshaper_8"],
    ["Overview", "/api/gallery/overview"],
    ["Facets", "/api/gallery/facets?library=all"],
  ];
  for (const [label, url] of queries) {
    const times: number[] = [];
    let found = 0;
    for (let i = 0; i < 15; i++) {
      const q = performance.now();
      const body = await json<{ total?: number }>(url);
      times.push(performance.now() - q);
      found = body.total ?? found;
    }
    const s = stats(times);
    rows.push([
      label,
      `median ${ms(s.median)}, p95 ${ms(s.p95)}${url.includes("images") ? ` (${found} matches)` : ""}`,
    ]);
  }

  // Thumbnails: the first two screens of a grid, 12 at a time like a browser would.
  const page = await json<{ items: Array<{ thumb: string }> }>("/api/gallery/images?limit=120");
  const thumbs = page.items.map((i) => i.thumb);
  const fetchAll = async () => {
    const each: number[] = [];
    const started = performance.now();
    let next = 0;
    await Promise.all(
      Array.from({ length: 12 }, async () => {
        while (next < thumbs.length) {
          const url = thumbs[next++] as string;
          const q = performance.now();
          await (await call(url)).arrayBuffer();
          each.push(performance.now() - q);
        }
      }),
    );
    return { all: performance.now() - started, ...stats(each) };
  };
  const cold = await fetchAll();
  const warm = await fetchAll();
  rows.push([
    "Thumbnails, cold (120, 12 at a time)",
    `${ms(cold.all)} total, median ${ms(cold.median)}, p95 ${ms(cold.p95)} each`,
  ]);
  rows.push([
    "Thumbnails, cached",
    `${ms(warm.all)} total, median ${ms(warm.median)}, p95 ${ms(warm.p95)} each`,
  ]);

  (globalThis as { gc?: () => void }).gc?.();
  const mem1 = process.memoryUsage();
  const dbFile = path.join(config.dataDir, "profiles", profile.id, "blombo.sqlite");
  const dbSize =
    (await fs.stat(dbFile)).size + ((await fs.stat(`${dbFile}-wal`).catch(() => null))?.size ?? 0);
  rows.push([
    "Server memory",
    `RSS ${mb(mem0.rss)} → ${mb(mem1.rss)}, heap ${mb(mem0.heapUsed)} → ${mb(mem1.heapUsed)}`,
  ]);
  rows.push(["Profile database", mb(dbSize)]);

  await services.shutdown();
  console.log(`\n| ${COUNT} images | |\n|---|---|`);
  for (const [k, v] of rows) console.log(`| ${k} | ${v} |`);
  if (!KEEP) await fs.rm(dir, { recursive: true, force: true });
  else console.log(`\nKept ${dir}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
