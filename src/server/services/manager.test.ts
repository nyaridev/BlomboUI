import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hfRepo } from "../../shared/manager.ts";
import { ManagerCatalog, parseCatalog } from "./manager.ts";
import type { ProfileService } from "./profiles.ts";

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

describe("Hugging Face repos and downloads", () => {
  it("finds the repo in download and page URLs", () => {
    expect(hfRepo("https://huggingface.co/x/y/resolve/main/a.pth")).toBe("x/y");
    expect(hfRepo("https://huggingface.co/x/y")).toBe("x/y");
    expect(hfRepo("https://huggingface.co/datasets/x/y/resolve/main/a")).toBeNull();
    expect(hfRepo("https://huggingface.co/x")).toBeNull();
    expect(hfRepo("http://huggingface.co/x/y")).toBeNull();
    expect(hfRepo("https://github.com/x/y")).toBeNull();
    const entries = parseCatalog(catalog);
    expect(entries[0]?.repo).toBe("x/4x-UltraSharp.pth");
    expect(entries[2]?.repo).toBeNull();
  });

  it("counts each repo once, caches a day and keeps old counts when rate-limited", async () => {
    const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-hf-"));
    const repos = ["a/one", "a/two", "a/three"];
    const list = {
      models: repos.flatMap((r) =>
        [1, 2].map((i) => ({
          name: `${r} ${i}`,
          type: "upscale",
          save_path: "default",
          filename: `${r.split("/")[1]}-${i}.pth`,
          url: `https://huggingface.co/${r}/resolve/main/${i}.pth`,
        })),
      ),
    };
    const asked: string[] = [];
    let limit = false;
    const fake = (async (input: URL | string) => {
      const u = new URL(String(input));
      if (u.pathname === "/list.json") return Response.json(list);
      asked.push(u.pathname);
      if (limit) return new Response("slow down", { status: 429 });
      if (u.pathname.endsWith("/two")) return new Response("gone", { status: 404 });
      return Response.json({ downloadsAllTime: u.pathname.length });
    }) as typeof fetch;
    const make = () =>
      new ManagerCatalog({
        url: "https://catalog.test/list.json",
        cacheDir,
        profiles: {} as ProfileService,
        fetch: fake,
        hfApi: "https://hf.test",
      });
    const stats = await make().downloads();
    expect(asked.sort()).toEqual(["/api/models/a/one", "/api/models/a/three", "/api/models/a/two"]);
    expect(stats.downloads).toEqual({ "a/one": 17, "a/three": 19 });
    // A new instance reads the day-old cache instead of asking again.
    asked.length = 0;
    expect((await make().downloads()).downloads).toEqual(stats.downloads);
    expect(asked).toEqual([]);
    // Past a day, a rate limit keeps the old counts.
    const file = path.join(cacheDir, "hf-downloads.json");
    const old = JSON.parse(await fs.readFile(file, "utf8"));
    await fs.writeFile(file, JSON.stringify({ ...old, at: 0 }));
    limit = true;
    expect((await make().downloads()).downloads).toEqual(stats.downloads);
    expect(asked.length).toBeLessThanOrEqual(6);
    await fs.rm(cacheDir, { recursive: true, force: true });
  });
});
