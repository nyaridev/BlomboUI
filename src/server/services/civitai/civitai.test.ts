import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BrowseFilter, CIVITAI_SITE_URLS, fromBase64Url } from "../../../shared/civitai.ts";
import { CivitaiApi } from "./api.ts";
import { FAKE_KEY } from "./fixtures/fake-civitai.ts";
import { type Online, setupOnline } from "./fixtures/setup.ts";
import { imageHostAllowed } from "./images.ts";

let o: Online;
beforeAll(async () => {
  o = await setupOnline();
});
afterAll(() => o.close());

const filter = (input: Record<string, unknown> = {}) => BrowseFilter.parse(input);

describe("browsing", () => {
  it("returns normalized cards with proxied images and a cursor", async () => {
    const loras = await o.services.civitai.search(filter({ types: ["LORA"] }), null);
    expect(loras.items.length).toBeGreaterThan(10);
    expect(loras.items.every((c) => c.type === "LORA" && c.kind === "loras")).toBe(true);
    const page = await o.services.civitai.search(filter(), null);
    const img = page.items[0]?.image;
    expect(img?.thumb).toMatch(/^\/api\/civitai\/image\?u=/);
    expect(fromBase64Url(img?.thumb.split("u=")[1] ?? "")).toMatch(/\/width=450\//);
    expect(page.nextCursor).not.toBeNull();
    const next = await o.services.civitai.search(filter(), page.nextCursor);
    expect(next.items[0]?.id).not.toBe(page.items[0]?.id);
  });

  it("lists NSFW models (the site decides) and caches answers", async () => {
    const before = o.fake.requests.length;
    const page = await o.services.civitai.search(filter({ sort: "Newest" }), null);
    expect(page.items.some((c) => c.nsfw)).toBe(true);
    await o.services.civitai.search(filter({ sort: "Newest" }), null);
    expect(o.fake.requests.length).toBe(before + 1);
  });

  it("looks a creator up and keeps a followed one's spelling and picture", async () => {
    const { settings } = o.services;
    await settings.update(o.profileId, { civitai: { following: ["PIXELSMITH", "nightowl"] } });
    const found = await o.services.civitai.refreshCreator("PIXELSMITH");
    expect(found?.username).toBe("pixelsmith");
    expect(found?.image).toMatch(/^\/api\/civitai\/image\?u=/);
    expect(fromBase64Url(found?.image?.split("u=")[1] ?? "")).toContain("avatar-pixelsmith");
    const saved = (await settings.get(o.profileId)).civitai.following;
    expect(saved).toEqual([found, { username: "nightowl", image: null }]);
    expect(await o.services.civitai.refreshCreator("nobody")).toBeNull();
    // Not followed: answered, nothing saved.
    await o.services.civitai.refreshCreator("lumen_lab");
    expect((await settings.get(o.profileId)).civitai.following).toHaveLength(2);
    await settings.update(o.profileId, { civitai: { following: [] } });
  });

  it("searches a published-date range through the site search, with the key", async () => {
    const range = { publishedFrom: "2026-09-01", publishedTo: "2026-09-10", sort: "Newest" };
    await expect(o.services.civitai.search(filter(range), null)).rejects.toThrow(/API key/);
    await o.services.civitai.setKey(FAKE_KEY, false);
    try {
      await expect(
        o.services.civitai.search(filter({ ...range, publishedTo: "" }), null),
      ).rejects.toThrow(/both dates/);
      await expect(
        o.services.civitai.search(filter({ ...range, publishedTo: "2026-10-30" }), null),
      ).rejects.toThrow(/31 days/);
      const page = await o.services.civitai.search(filter(range), null);
      expect(o.fake.requests.at(-1)?.path).toContain("/api/trpc/model.getAll");
      expect(page.items.length).toBeGreaterThan(0);
      for (const c of page.items) {
        expect(c.publishedAt && c.publishedAt < "2026-09-11").toBe(true);
        expect(c.publishedAt && c.publishedAt >= "2026-09-01").toBe(true);
      }
      const first = page.items[0];
      expect(first?.versionId).not.toBeNull();
      expect(first?.creator).toBeTruthy();
      expect(fromBase64Url(first?.image?.thumb.split("u=")[1] ?? "")).toMatch(
        /\/img\/[0-9a-f-]{36}\/width=450\//,
      );
      // The cursor comes back typed (a bigint): the next page asks with it and gets new models.
      expect(page.nextCursor).toBeNull();
      const month = filter({ ...range, publishedTo: "2026-09-28" });
      const wide = await o.services.civitai.search(month, null);
      expect(wide.nextCursor).toMatch(/^t:/);
      const next = await o.services.civitai.search(month, wide.nextCursor);
      expect(next.items.length).toBeGreaterThan(0);
      expect(next.items.some((c) => wide.items.some((x) => x.id === c.id))).toBe(false);
    } finally {
      await o.services.civitai.removeKey();
    }
  });

  it("lists the base models Civitai offers, or the built-in ones when it can't answer", async () => {
    const live = await o.services.civitai.baseModels();
    expect(live.fromCivitai).toBe(true);
    expect(live.names).toContain("Wan Video 3.1");
    expect(live.names).not.toContain("SD 2.0 768");
    o.services.civitai.api.setSite("http://127.0.0.1:9");
    o.services.civitai.api.clearMemory();
    try {
      const offline = await o.services.civitai.baseModels();
      expect(offline.fromCivitai).toBe(false);
      expect(offline.names).toContain("Wan Video 2.2 T2V-A14B");
    } finally {
      o.services.civitai.api.setSite(o.fake.url);
    }
  });

  it("filters by category and merges followed creators' newest models", async () => {
    const styles = await o.services.civitai.search(filter({ tag: "style" }), null);
    expect(styles.items.length).toBeGreaterThan(0);
    expect(o.fake.requests.at(-1)?.path).toContain("tag=style");
    const feed = await o.services.civitai.feed(["pixelsmith", "nightowl", "nobody"], filter());
    const creators = new Set(feed.items.map((c) => c.creator));
    expect([...creators].sort()).toEqual(["nightowl", "pixelsmith"]);
    const dates = feed.items.map((c) => c.publishedAt ?? "");
    expect(dates).toEqual([...dates].sort().reverse());
    expect(feed.nextCursor).toBeNull();
  });

  it("records searches with a query", async () => {
    await o.services.civitai.search(filter({ query: "neon" }), null);
    await new Promise((r) => setTimeout(r, 20));
    expect(o.services.civitai.searches().map((s) => s.query)).toContain("neon");
    o.services.civitai.forgetSearch("neon");
    expect(o.services.civitai.searches().map((s) => s.query)).not.toContain("neon");
  });

  it("opens a model page with a safe description and records the view", async () => {
    const m = await o.services.civitai.model(1001);
    expect(m.versions.length).toBeGreaterThan(0);
    expect(m.versions[0]?.files[0]?.sha256).toMatch(/^[0-9A-F]{64}$/);
    const text = JSON.stringify(m.description);
    expect(text).not.toMatch(/alert|javascript:/);
    expect(text).toContain("/models/1002");
    expect(o.services.civitai.views()[0]?.modelId).toBe(1001);
    o.services.civitai.forgetView(1001);
    expect(o.services.civitai.views().some((v) => v.modelId === 1001)).toBe(false);
  });

  it("finds a file's model by its hash, without adding it to the history", async () => {
    const m = await o.services.civitai.model(1001);
    o.services.civitai.clearViews();
    const version = m.versions[0];
    const match = await o.services.civitai.byHash(version?.files[0]?.sha256 ?? "");
    expect(match?.model.id).toBe(1001);
    expect(match?.versionId).toBe(version?.id);
    expect(o.services.civitai.views()).toEqual([]);
    expect(await o.services.civitai.byHash("0".repeat(64))).toBeNull();
    // A short hash (AutoV3 from a header) finds it too; images say who posted them and how.
    const short = await o.services.civitai.byHash(version?.files[0]?.sha256?.slice(0, 12) ?? "");
    const images = short?.model.versions.find((v) => v.id === short?.versionId)?.images ?? [];
    expect(images[0]?.by).toBe(m.creator);
    expect(images[2]?.by).toBe("a_fan");
    expect(images[0]?.meta).toMatchObject({ negative: "blurry, lowres" });
    expect(images[0]?.meta?.settings).toContainEqual(["Seed", "1234567"]);
    expect(images[1]?.meta).toBeNull();
  });

  it("marks models already in the models folder", async () => {
    const dir = path.join(o.models, "loras");
    await fs.writeFile(path.join(dir, "mine.safetensors"), "x");
    await fs.writeFile(
      path.join(dir, "mine.civitai.info"),
      JSON.stringify({ id: 10011, modelId: 1001, name: "v1.0" }),
    );
    o.services.models.invalidate();
    const m = await o.services.civitai.model(1001);
    expect(m.local).toEqual({ versions: [10011], latest: true });
  });
});

describe("account", () => {
  it("checks and saves a key without ever returning it", async () => {
    await expect(o.services.civitai.setKey("wrongKey12345", true)).rejects.toThrow(/didn't accept/);
    const account = await o.services.civitai.setKey(FAKE_KEY, true);
    expect(account).toMatchObject({
      keySet: true,
      keyHint: FAKE_KEY.slice(-4),
      username: "tester",
    });
    expect(JSON.stringify(account)).not.toContain(FAKE_KEY);
    const file = path.join(o.services.profiles.dir(o.profileId), "secrets.json");
    expect(JSON.parse(await fs.readFile(file, "utf8")).civitai.key).toBe(FAKE_KEY);
    const profileJson = await fs.readFile(
      path.join(o.services.profiles.dir(o.profileId), "profile.json"),
      "utf8",
    );
    expect(profileJson).not.toContain(FAKE_KEY);
    // The key goes to Civitai with API calls.
    await o.services.civitai.search(filter({ query: "key check" }), null);
    expect(o.fake.requests.at(-1)?.auth).toBe(`Bearer ${FAKE_KEY}`);
    expect((await o.services.civitai.removeKey()).keySet).toBe(false);
  });
});

describe("image proxy", () => {
  it("caches Civitai images and refuses videos and other hosts", async () => {
    const url = `${o.fake.url}/img/abc/width=450/1.jpeg`;
    const first = await o.services.civitai.images.get(url);
    expect(first.type).toBe("image/jpeg");
    const count = o.fake.requests.length;
    await o.services.civitai.images.get(url);
    expect(o.fake.requests.length).toBe(count);
    await expect(
      o.services.civitai.images.get(`${o.fake.url}/img/abc/original=true/2.mp4`),
    ).rejects.toThrow(/isn't an image/);
    await expect(o.services.civitai.images.get("https://example.com/a.jpeg")).rejects.toThrow(
      /isn't from Civitai/,
    );
  });

  it("takes images from both Civitai sites and nowhere that only looks like them", () => {
    const ok = (u: string) => imageHostAllowed(new URL(u), "http://127.0.0.1:1");
    expect(ok("https://image.civitai.com/a/b.jpeg")).toBe(true);
    expect(ok("https://image.civitai.red/a/b.jpeg")).toBe(true);
    expect(ok("https://civitai.red/a.jpeg")).toBe(true);
    expect(ok("https://civitai.red.example.com/a.jpeg")).toBe(false);
    expect(ok("https://evilcivitai.red/a.jpeg")).toBe(false);
    expect(ok("http://image.civitai.red/a.jpeg")).toBe(false);
  });
});

describe("site", () => {
  it("asks the site it's switched to, with the key going only there", async () => {
    const calls: Array<{ url: string; auth: string | null }> = [];
    const api = new CivitaiApi({
      baseUrl: CIVITAI_SITE_URLS.com,
      cacheDir: await fs.mkdtemp(path.join(os.tmpdir(), "blombo-civitai-site-")),
      fetch: async (url, init) => {
        calls.push({
          url: String(url),
          auth: new Headers(init?.headers).get("authorization"),
        });
        return Response.json({ items: [] });
      },
    });
    await api.models(filter(), null, "KEY");
    api.setSite(CIVITAI_SITE_URLS.red);
    expect(api.origin).toBe("https://civitai.red");
    await api.models(filter(), null, "KEY");
    expect(calls.map((c) => new URL(c.url).host)).toEqual(["civitai.com", "civitai.red"]);
    expect(calls.every((c) => c.auth === "Bearer KEY")).toBe(true);
  });
});
