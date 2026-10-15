/**
 * A fake Civitai (and model catalog) for tests and dev checks, so neither ever calls the real
 * site or downloads a real model. It serves:
 *
 *   /api/v1/models, /models/:id, /model-versions/:id, /model-versions/by-hash/:sha, /me
 *   /api/download/models/:versionId  → redirects to /blobs/:fileId (range requests supported)
 *   /img/<uuid>/<transform>/<name>   → generated JPEGs (a "video" original is refused as mp4)
 *   /catalog/model-list.json         → a small ComfyUI-Manager style catalog of /files/<name>
 *
 * Files are made of deterministic bytes, so their SHA256 is known. Import startFakeCivitai()
 * in-process, or run `node fake-civitai.ts --port 8298 [--slow <bytes/s>] [--file-kb N]` and
 * start Blombo with `--civitai http://127.0.0.1:8298 --catalog
 * http://127.0.0.1:8298/catalog/model-list.json`. The API key it accepts is FAKE_KEY.
 */
import { createHash } from "node:crypto";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

export const FAKE_KEY = "fakeKey1234567890";

export interface FakeCivitaiOptions {
  port?: number;
  /** Throttle file downloads (bytes per second); 0 = as fast as possible. */
  bytesPerSecond?: number;
  /** Size of each model file in KB (small by default so tests stay fast). */
  fileKb?: number;
}

export interface FakeCivitai {
  url: string;
  port: number;
  /** Every request path, newest last. */
  requests: Array<{ path: string; auth: string | null; range: string | null }>;
  models: FakeModel[];
  /** SHA256 (uppercase) of a file. */
  sha256: (fileId: number) => string;
  bytesOf: (fileId: number) => Uint8Array;
  /** Drop the connection halfway through the next download of this file. */
  failOnce: (fileId: number) => void;
  close: () => Promise<void>;
}

interface FakeFile {
  id: number;
  name: string;
  sizeKB: number;
  type: string;
  primary: boolean;
}
interface FakeVersion {
  id: number;
  name: string;
  baseModel: string;
  earlyAccess: boolean;
  trainedWords: string[];
  files: FakeFile[];
  images: Array<{ id: number; uuid: string; nsfwLevel: number; video: boolean }>;
  publishedAt: string;
}
export interface FakeModel {
  id: number;
  name: string;
  type: string;
  nsfw: boolean;
  creator: string;
  tags: string[];
  downloads: number;
  likes: number;
  versions: FakeVersion[];
}

const ADJ = ["Cinematic", "Soft", "Neon", "Golden", "Velvet", "Ink", "Glass", "Pastel", "Retro"];
const NOUN = ["Lighting", "Detailer", "Anime", "Portrait", "Fog", "Watercolor", "Armor", "Bloom"];
const TYPES = [
  "LORA",
  "LORA",
  "LORA",
  "Checkpoint",
  "TextualInversion",
  "LoCon",
  "VAE",
  "Controlnet",
  "Upscaler",
  "Workflows",
];
const BASES = ["Illustrious", "SDXL 1.0", "Pony", "SD 1.5", "Flux.1 D", "NoobAI"];
const CREATORS = ["pixelsmith", "lumen_lab", "kaito_art", "nightowl", "studio-vee"];
const TAGS = ["style", "character", "concept", "tool", "clothing", "background"];

function buildModels(fileKb: number): FakeModel[] {
  const out: FakeModel[] = [];
  for (let i = 0; i < 72; i++) {
    const id = 1001 + i;
    const type = TYPES[i % TYPES.length] as string;
    const versions: FakeVersion[] = [];
    const count = 1 + (i % 3);
    for (let k = count; k >= 1; k--) {
      const vid = id * 10 + k;
      const ext = type === "TextualInversion" ? "pt" : "safetensors";
      versions.push({
        id: vid,
        name: `v${k}.0`,
        baseModel: BASES[(i + k) % BASES.length] as string,
        earlyAccess: id === 1003 && k === count,
        trainedWords:
          type === "LORA"
            ? [`${(NOUN[i % NOUN.length] as string).toLowerCase()}_style`, "masterpiece"]
            : [],
        files: [
          {
            id: vid * 10 + 1,
            name: `${ADJ[i % ADJ.length] as string}_${NOUN[(i >> 1) % NOUN.length]}_v${k}.${ext}`,
            sizeKB: fileKb + (i % 5) * 16,
            type: "Model",
            primary: true,
          },
          ...(k === count && type === "Checkpoint"
            ? [
                {
                  id: vid * 10 + 2,
                  name: `vae_for_${id}.safetensors`,
                  sizeKB: 32,
                  type: "VAE",
                  primary: false,
                },
              ]
            : []),
        ],
        images: [0, 1, 2].map((n) => ({
          id: vid * 100 + n,
          uuid: createHash("md5")
            .update(`${vid}-${n}`)
            .digest("hex")
            .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5"),
          nsfwLevel: i % 7 === 3 ? 8 : n === 2 ? 2 : 1,
          video: n === 1 && i % 6 === 0,
        })),
        publishedAt: new Date(Date.UTC(2026, 8, 1 + (i % 28), 12)).toISOString(),
      });
    }
    out.push({
      id,
      name: `${ADJ[i % ADJ.length]} ${NOUN[(i >> 1) % NOUN.length]} ${i + 1}`,
      type,
      nsfw: i % 7 === 3,
      creator: CREATORS[i % CREATORS.length] as string,
      tags: [TAGS[i % TAGS.length] as string, "anime"],
      downloads: 50_000 - i * 611,
      likes: 9_000 - ((i * 337) % 9_000),
      versions,
    });
  }
  return out;
}

/** Deterministic bytes for a file (xorshift), so its hash is stable. */
function fileBytes(fileId: number, size: number): Uint8Array {
  const out = new Uint8Array(size);
  let x = (fileId * 2654435761) >>> 0 || 1;
  for (let i = 0; i < size; i++) {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    out[i] = x & 0xff;
  }
  return out;
}

const DESCRIPTION = `<p>A <strong>fake</strong> model for Blombo's checks. Use <em>low</em> weights.</p>
<h3>Tips</h3><ul><li>Weight 0.6–0.8</li><li>Works with <a href="/models/1002">its sibling</a></li></ul>
<script>alert("never runs")</script><p><a href="javascript:alert(1)">bad link</a></p>`;

export async function startFakeCivitai(opts: FakeCivitaiOptions = {}): Promise<FakeCivitai> {
  const fileKb = opts.fileKb ?? 48;
  const models = buildModels(fileKb);
  const requests: FakeCivitai["requests"] = [];
  const failing = new Set<number>();
  const files = new Map<number, { file: FakeFile; version: FakeVersion; model: FakeModel }>();
  for (const m of models)
    for (const v of m.versions)
      for (const f of v.files) files.set(f.id, { file: f, version: v, model: m });
  const bytesCache = new Map<number, Uint8Array>();
  const bytesOf = (fileId: number) => {
    let b = bytesCache.get(fileId);
    if (!b) {
      const f = files.get(fileId)?.file;
      b = fileBytes(fileId, Math.round((f?.sizeKB ?? 1) * 1024));
      bytesCache.set(fileId, b);
    }
    return b;
  };
  const shaCache = new Map<number, string>();
  const sha256 = (fileId: number) => {
    let s = shaCache.get(fileId);
    if (!s) {
      s = createHash("sha256").update(bytesOf(fileId)).digest("hex").toUpperCase();
      shaCache.set(fileId, s);
    }
    return s;
  };
  const catalogFiles = new Map<string, number>([
    ["4x-FakeSharp.pth", 40_000],
    ["RealFake_x4plus_anime.pth", 30_000],
    ["face_yolo_fake.pt", 20_000],
    ["hand_yolo_fake.pt", 18_000],
    ["person_yolo_fake-seg.pt", 22_000],
    ["sam_vit_fake.pth", 60_000],
    ["controlnet-fake-openpose.safetensors", 80_000],
    ["controlnet-fake-canny.safetensors", 80_000],
    ["taesd_fake_decoder.pth", 5_000],
    ["clip_vision_fake.safetensors", 25_000],
    ["ip-adapter_fake.safetensors", 25_000],
    ["gated_model.safetensors", 1_000],
  ]);

  let base = "";
  const json = (res: http.ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };

  const imageUrl = (img: FakeVersion["images"][number]) =>
    `${base}/img/${img.uuid}/original=true/${img.id}.${img.video ? "mp4" : "jpeg"}`;
  const versionJson = (m: FakeModel, v: FakeVersion, withModel: boolean) => ({
    id: v.id,
    modelId: m.id,
    name: v.name,
    baseModel: v.baseModel,
    baseModelType: "Standard",
    publishedAt: v.publishedAt,
    availability: v.earlyAccess ? "EarlyAccess" : "Public",
    trainedWords: v.trainedWords,
    description: `<p>Changes in ${v.name}.</p>`,
    stats: { downloadCount: Math.round(m.downloads / 3) },
    files: v.files.map((f) => ({
      id: f.id,
      sizeKB: f.sizeKB,
      name: f.name,
      type: f.type,
      pickleScanResult: "Success",
      virusScanResult: "Success",
      metadata: { format: f.name.endsWith(".pt") ? "PickleTensor" : "SafeTensor", fp: "fp16" },
      hashes: { SHA256: sha256(f.id), AutoV2: sha256(f.id).slice(0, 10) },
      downloadUrl: `${base}/api/download/models/${v.id}${f.primary ? "" : `?type=${f.type}`}`,
      primary: f.primary,
    })),
    images: v.images.map((img) => ({
      id: img.id,
      url: imageUrl(img),
      nsfwLevel: img.nsfwLevel,
      width: 832,
      height: 1216,
      type: img.video ? "video" : "image",
    })),
    downloadUrl: `${base}/api/download/models/${v.id}`,
    ...(withModel ? { model: { name: m.name, type: m.type, nsfw: m.nsfw, poi: false } } : {}),
  });
  const modelJson = (m: FakeModel) => ({
    id: m.id,
    name: m.name,
    description: DESCRIPTION,
    type: m.type,
    nsfw: m.nsfw,
    nsfwLevel: m.nsfw ? 28 : 1,
    tags: m.tags,
    creator: {
      username: m.creator,
      image: `${base}/img/avatar-${m.creator}/width=96/${m.creator}.jpeg`,
    },
    stats: { downloadCount: m.downloads, thumbsUpCount: m.likes },
    modelVersions: m.versions.map((v) => versionJson(m, v, false)),
  });

  const sendBytes = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    bytes: Uint8Array,
    name: string,
    fail: boolean,
  ) => {
    let start = 0;
    const range = /^bytes=(\d+)-$/.exec(req.headers.range ?? "");
    if (range) {
      start = Number(range[1]);
      if (start >= bytes.byteLength) {
        res.writeHead(416, { "content-range": `bytes */${bytes.byteLength}` });
        res.end();
        return;
      }
      res.writeHead(206, {
        "content-type": "application/octet-stream",
        "content-length": String(bytes.byteLength - start),
        "content-range": `bytes ${start}-${bytes.byteLength - 1}/${bytes.byteLength}`,
        "accept-ranges": "bytes",
      });
    } else
      res.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-length": String(bytes.byteLength),
        "content-disposition": `attachment; filename="${name}"`,
        "accept-ranges": "bytes",
      });
    const rate = opts.bytesPerSecond ?? 0;
    const chunk = rate ? Math.max(1024, Math.round(rate / 10)) : 64 * 1024;
    for (let at = start; at < bytes.byteLength; at += chunk) {
      if (fail && at - start >= (bytes.byteLength - start) / 2) {
        // Let what was sent reach the client, then drop the connection.
        await new Promise((r) => setTimeout(r, 60));
        res.destroy();
        return;
      }
      if (res.destroyed) return;
      res.write(bytes.subarray(at, Math.min(bytes.byteLength, at + chunk)));
      if (rate) await new Promise((r) => setTimeout(r, 100));
    }
    res.end();
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", base || "http://localhost");
    const p = url.pathname;
    const auth = req.headers.authorization ?? null;
    requests.push({ path: `${p}${url.search}`, auth, range: req.headers.range ?? null });
    const authed = auth === `Bearer ${FAKE_KEY}`;
    if (auth && !authed && p.startsWith("/api/")) return json(res, 401, { error: "Unauthorized" });
    void (async () => {
      let m: RegExpExecArray | null;
      if (p === "/api/v1/me") {
        if (!authed) return json(res, 401, { error: "Unauthorized" });
        return json(res, 200, { id: 7, username: "tester", tier: "free" });
      }
      if (p === "/api/v1/models") {
        const q = (url.searchParams.get("query") ?? "").toLowerCase();
        const types = url.searchParams.getAll("types");
        const bases = url.searchParams.getAll("baseModels");
        const user = url.searchParams.get("username");
        const nsfw = url.searchParams.get("nsfw") !== "false";
        const sort = url.searchParams.get("sort") ?? "Highest Rated";
        const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 20));
        const offset = Number(url.searchParams.get("cursor") ?? 0) || 0;
        const list = models
          .filter(
            (x) => !q || `${x.name} ${x.tags.join(" ")} ${x.creator}`.toLowerCase().includes(q),
          )
          .filter((x) => !types.length || types.includes(x.type))
          .filter((x) => !bases.length || x.versions.some((v) => bases.includes(v.baseModel)))
          .filter((x) => !user || x.creator === user)
          .filter((x) => nsfw || !x.nsfw)
          .sort((a, b) =>
            sort === "Newest"
              ? b.id - a.id
              : sort === "Most Downloaded"
                ? b.downloads - a.downloads
                : b.likes - a.likes,
          );
        const items = list.slice(offset, offset + limit).map(modelJson);
        const next = offset + limit < list.length ? String(offset + limit) : null;
        return json(res, 200, {
          items,
          metadata: next
            ? { nextCursor: next, nextPage: `${base}/api/v1/models?cursor=${next}` }
            : {},
        });
      }
      m = /^\/api\/v1\/models\/(\d+)$/.exec(p);
      if (m) {
        const model = models.find((x) => x.id === Number(m?.[1]));
        return model
          ? json(res, 200, modelJson(model))
          : json(res, 404, { error: "Model not found" });
      }
      m = /^\/api\/v1\/model-versions\/by-hash\/([0-9a-fA-F]+)$/.exec(p);
      if (m) {
        const sha = (m[1] ?? "").toUpperCase();
        for (const [id, entry] of files)
          if (sha256(id) === sha)
            return json(res, 200, versionJson(entry.model, entry.version, true));
        return json(res, 404, { error: "Model not found" });
      }
      m = /^\/api\/v1\/model-versions\/(\d+)$/.exec(p);
      if (m) {
        for (const model of models)
          for (const v of model.versions)
            if (v.id === Number(m[1])) return json(res, 200, versionJson(model, v, true));
        return json(res, 404, { error: "Version not found" });
      }
      m = /^\/api\/download\/models\/(\d+)$/.exec(p);
      if (m) {
        const vid = Number(m[1]);
        const type = url.searchParams.get("type");
        const entry = [...files.values()].find(
          (e) => e.version.id === vid && (type ? e.file.type === type : e.file.primary),
        );
        if (!entry) return json(res, 404, { error: "File not found" });
        if (entry.version.earlyAccess && !authed)
          return json(res, 401, { error: "Early access: log in to download" });
        res.writeHead(307, { location: `/blobs/${entry.file.id}` });
        return res.end();
      }
      m = /^\/blobs\/(\d+)$/.exec(p);
      if (m) {
        const id = Number(m[1]);
        const entry = files.get(id);
        if (!entry) return json(res, 404, { error: "Not found" });
        const fail = failing.delete(id);
        return sendBytes(req, res, bytesOf(id), entry.file.name, fail);
      }
      m = /^\/img\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(p);
      if (m) {
        const [, uuid = "", transform = "", name = ""] = m;
        if (transform.includes("original=true") && name.endsWith(".mp4")) {
          res.writeHead(200, { "content-type": "video/mp4" });
          return res.end(Buffer.alloc(2048, 7));
        }
        const width = Math.min(1600, Number(/width=(\d+)/.exec(transform)?.[1] ?? 512));
        const hue = Number.parseInt(createHash("md5").update(uuid).digest("hex").slice(0, 6), 16);
        const jpeg = await sharp({
          create: {
            width,
            height: Math.round(width * 1.4),
            channels: 3,
            background: { r: hue & 0xff, g: (hue >> 8) & 0xff, b: (hue >> 16) & 0xff },
          },
        })
          .jpeg({ quality: 70 })
          .toBuffer();
        res.writeHead(200, {
          "content-type": "image/jpeg",
          "content-length": String(jpeg.byteLength),
        });
        return res.end(jpeg);
      }
      if (p === "/catalog/model-list.json") {
        const entry = (
          name: string,
          type: string,
          savePath: string,
          file: string,
          family = "SDXL",
        ) => ({
          name,
          type,
          base: family,
          save_path: savePath,
          description: `${name}, a fake catalog entry for checks.`,
          reference: "https://example.com/fake",
          filename: file,
          url: `${base}/files/${file}`,
          size: `${((catalogFiles.get(file) ?? 1000) / 1024).toFixed(1)}KB`,
        });
        return json(res, 200, {
          models: [
            entry("4x-FakeSharp", "upscale", "default", "4x-FakeSharp.pth", "upscale"),
            entry(
              "RealFake x4plus anime",
              "upscale",
              "default",
              "RealFake_x4plus_anime.pth",
              "upscale",
            ),
            entry(
              "face_yolo_fake (bbox)",
              "Ultralytics",
              "ultralytics/bbox",
              "face_yolo_fake.pt",
              "Ultralytics",
            ),
            entry(
              "hand_yolo_fake (bbox)",
              "Ultralytics",
              "ultralytics/bbox",
              "hand_yolo_fake.pt",
              "Ultralytics",
            ),
            entry(
              "person_yolo_fake (segm)",
              "Ultralytics",
              "ultralytics/segm",
              "person_yolo_fake-seg.pt",
              "Ultralytics",
            ),
            entry("SAM ViT fake", "sam", "sams", "sam_vit_fake.pth", "SAM"),
            entry(
              "ControlNet fake openpose",
              "controlnet",
              "controlnet/SDXL",
              "controlnet-fake-openpose.safetensors",
            ),
            entry(
              "ControlNet fake canny",
              "controlnet",
              "controlnet/SDXL",
              "controlnet-fake-canny.safetensors",
            ),
            entry("TAESD fake decoder", "TAESD", "vae_approx", "taesd_fake_decoder.pth", "SD1.x"),
            entry("CLIP vision fake", "clip_vision", "clip_vision", "clip_vision_fake.safetensors"),
            entry("IP-Adapter fake", "IP-Adapter", "ipadapter", "ip-adapter_fake.safetensors"),
            entry(
              "Gated model (needs login)",
              "checkpoint",
              "checkpoints/SDXL",
              "gated_model.safetensors",
            ),
            entry(
              "Custom node model",
              "lora",
              "custom_nodes/fake-node/models",
              "node_model.safetensors",
            ),
          ],
        });
      }
      m = /^\/files\/([^/]+)$/.exec(p);
      if (m) {
        const name = decodeURIComponent(m[1] ?? "");
        if (name === "gated_model.safetensors") return json(res, 401, { error: "Login required" });
        const size = catalogFiles.get(name);
        if (!size) return json(res, 404, { error: "Not found" });
        const id = Number.parseInt(createHash("md5").update(name).digest("hex").slice(0, 7), 16);
        return sendBytes(req, res, fileBytes(id, size), name, false);
      }
      json(res, 404, { error: "Not found" });
    })().catch((error) => {
      if (!res.headersSent) json(res, 500, { error: String(error) });
      else res.destroy();
    });
  });

  return new Promise((resolve) => {
    server.listen(opts.port ?? 0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      base = `http://127.0.0.1:${port}`;
      resolve({
        url: base,
        port,
        requests,
        models,
        sha256,
        bytesOf,
        failOnce: (id) => failing.add(id),
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}

// node fake-civitai.ts [--port 8298] [--slow <bytes/s>] [--file-kb N]
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name: string) => {
    const at = process.argv.indexOf(name);
    return at > 0 ? process.argv[at + 1] : undefined;
  };
  const fake = await startFakeCivitai({
    port: Number(arg("--port") ?? 8298),
    bytesPerSecond: Number(arg("--slow") ?? 0),
    fileKb: Number(arg("--file-kb") ?? 48),
  });
  console.log(`Fake Civitai on ${fake.url} (API key: ${FAKE_KEY})`);
  console.log(`  Blombo: --civitai ${fake.url} --catalog ${fake.url}/catalog/model-list.json`);
}
