import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createConfig, parseFlags } from "../config.ts";
import { realPng } from "../lib/test-images.ts";
import { ProfileService } from "./profiles.ts";
import { ScopeService, saveScopeThumb, scopeThumbPath } from "./scopes.ts";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-scopes-"));
const config = createConfig(parseFlags(["--data", path.join(tmp, "data")]));
const profiles = new ProfileService(config);
let changed = 0;
const scopes = new ScopeService({ profiles, onChanged: () => changed++ });

beforeAll(async () => {
  const p = await profiles.create({
    name: "Scopes",
    accent: "blue",
    theme: "blombo",
    paths: { models: "", outputs: "", wildcards: "" },
    comfy: { mode: "external", url: "http://127.0.0.1:1" },
    presets: [],
  });
  await profiles.open(p.id);
});

afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("scope service", () => {
  it("starts with the default scope and lists folders the script made", async () => {
    expect((await scopes.state()).scopes.map((s) => s.id)).toEqual(["default"]);
    const dir = profiles.dir(profiles.active as string);
    await saveScopeThumb(dir, "night", "loras", "style/glow.safetensors", await realPng(32, 32));
    const state = await scopes.state();
    expect(state.scopes.map((s) => s.id)).toEqual(["default", "night"]);
    expect(Object.keys(state.thumbs.night ?? {})).toEqual(["loras/style/glow.safetensors"]);
  });

  it("creates, edits and picks scopes", async () => {
    const anime = await scopes.create({ name: "Anime", group: "Styles", tags: ["anime"] });
    expect(anime.id).toBe("anime");
    await scopes.update("anime", {
      name: "Anime",
      group: "Styles",
      tags: ["anime", "anime", "cel"],
    });
    const state = await scopes.setOptions({ active: "anime", auto: true });
    expect(state).toMatchObject({ active: "anime", auto: true });
    expect(state.scopes.find((s) => s.id === "anime")?.tags).toEqual(["anime", "cel"]);
    await expect(scopes.setOptions({ active: "nope" })).rejects.toThrow("doesn't exist");
  });

  it("sets and removes a model's picture, into the trash", async () => {
    await scopes.setThumb("anime", "checkpoints", "sd15/dream.safetensors", await realPng(40, 20));
    const state = await scopes.state();
    const url = state.thumbs.anime?.["checkpoints/sd15/dream.safetensors"];
    expect(url).toMatch(/^\/api\/scopes\/thumb\?scope=anime&key=/);
    const file = await scopes.thumbFile("anime", "checkpoints/sd15/dream.safetensors");
    expect((await fs.readFile(file)).subarray(8, 12).toString("latin1")).toBe("WEBP");
    await scopes.removeThumb("anime", "checkpoints", "sd15/dream.safetensors");
    await expect(fs.access(file)).rejects.toThrow();
    expect(changed).toBe(2);
    await expect(
      scopes.setThumb("anime", "loras", "x.safetensors", new Uint8Array([1, 2])),
    ).rejects.toThrow("isn't an image");
  });

  it("refuses names that leave the scope folder", async () => {
    expect(scopeThumbPath(tmp, "default", "loras", "../evil")).toBeNull();
    expect(scopeThumbPath(tmp, "../x", "loras", "a.safetensors")).toBeNull();
    await expect(scopes.thumbFile("default", "loras/../../profile.json")).rejects.toThrow();
  });

  it("removes a scope (pictures to the trash) but never the default", async () => {
    await scopes.remove("night");
    const state = await scopes.state();
    expect(state.scopes.map((s) => s.id)).toEqual(["default", "anime"]);
    await expect(scopes.remove("default")).rejects.toThrow("can't be removed");
    const trash = await fs.readdir(
      path.join(profiles.dir(profiles.active as string), "trash", "scopes"),
    );
    expect(trash.some((n) => n.endsWith("-night"))).toBe(true);
  });
});
