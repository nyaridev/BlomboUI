import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BrowseFilter, fromBase64Url } from "../../../shared/civitai.ts";
import { FAKE_KEY } from "./fixtures/fake-civitai.ts";
import { type Online, setupOnline } from "./fixtures/setup.ts";

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

  it("hides NSFW models when asked and caches answers", async () => {
    const before = o.fake.requests.length;
    const sfw = await o.services.civitai.search(filter({ nsfw: false, sort: "Newest" }), null);
    expect(sfw.items.some((c) => c.nsfw)).toBe(false);
    await o.services.civitai.search(filter({ nsfw: false, sort: "Newest" }), null);
    expect(o.fake.requests.length).toBe(before + 1);
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
});
