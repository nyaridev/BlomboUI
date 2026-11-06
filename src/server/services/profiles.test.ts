import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { createConfig } from "../config.ts";
import { createServices, type Services } from "../context.ts";
import { ProfileService } from "./profiles.ts";

const DEAD = "http://127.0.0.1:9";
let dir: string;
let services: Services;
let app: ReturnType<typeof createApp>;

const json = (method: string, body?: unknown) => ({
  method,
  headers: { "content-type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-profiles-"));
  await fs.mkdir(path.join(dir, "outputs"));
  const config = createConfig({
    dev: true,
    port: 4398,
    open: "none",
    dataDir: path.join(dir, "data"),
    runtimeDir: path.join(dir, "runtime"),
    civitaiUrl: DEAD,
    catalogUrl: `${DEAD}/x.json`,
    huggingfaceUrl: DEAD,
  });
  services = createServices(config);
  app = createApp(services);
});
afterAll(async () => {
  await services.shutdown();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("removing a profile", () => {
  it("moves the open profile to the trash, database and all, and nothing brings it back", async () => {
    const res = await app.request(
      "/api/profiles",
      json("POST", {
        name: "Gone",
        paths: { outputs: path.join(dir, "outputs"), models: "", wildcards: "" },
        comfy: { mode: "external", url: DEAD },
      }),
    );
    const { id } = (await res.json()) as { id: string };
    expect((await app.request(`/api/profiles/${id}/open`, json("POST", {}))).ok).toBe(true);
    // The profile's database is open (the gallery reads it).
    expect((await app.request("/api/gallery/overview")).ok).toBe(true);
    await services.gallery.whenSynced();

    expect((await app.request(`/api/profiles/${id}`, { method: "DELETE" })).status).toBe(204);
    const profileDir = path.join(dir, "data", "profiles", id);
    await expect(fs.stat(profileDir)).rejects.toThrow();
    const trash = await fs.readdir(path.join(dir, "data", "trash"));
    expect(trash.some((n) => n.startsWith(`${id}-`))).toBe(true);
    // Later requests don't recreate the folder.
    await app.request("/api/gallery/overview");
    await expect(fs.stat(profileDir)).rejects.toThrow();
    expect(services.profiles.active).toBeNull();
  });
});

describe("creating a profile", () => {
  it("makes folders that are missing and leaves existing ones alone", async () => {
    const root = path.join(dir, "master");
    await fs.mkdir(path.join(root, "Models", "loras"), { recursive: true });
    await fs.writeFile(path.join(root, "Models", "loras", "keep.safetensors"), "x");
    const paths = {
      models: path.join(root, "Models"),
      outputs: path.join(root, "Output"),
      wildcards: path.join(root, "Wildcards"),
    };
    const res = await app.request(
      "/api/profiles",
      json("POST", { name: "Master", paths, comfy: { mode: "external", url: DEAD } }),
    );
    expect(res.ok).toBe(true);
    for (const folder of Object.values(paths))
      expect((await fs.stat(folder)).isDirectory()).toBe(true);
    expect(await fs.readFile(path.join(root, "Models", "loras", "keep.safetensors"), "utf8")).toBe(
      "x",
    );
  });

  it("refuses a folder it can't create, before making the profile", async () => {
    const file = path.join(dir, "a-file");
    await fs.writeFile(file, "x");
    const res = await app.request(
      "/api/profiles",
      json("POST", {
        name: "Blocked",
        paths: { models: "", outputs: path.join(file, "Output"), wildcards: "" },
        comfy: { mode: "external", url: DEAD },
      }),
    );
    expect(res.status).toBe(400);
    const list = (await (await app.request("/api/profiles")).json()) as {
      profiles: Array<{ name: string }>;
    };
    expect(list.profiles.some((p) => p.name === "Blocked")).toBe(false);
  });
});

describe("the dev profile", () => {
  it("is made in dev mode only, with folders in runtime/dev, and hidden outside dev mode", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-devprofile-"));
    const flags = {
      port: 4398,
      open: "none" as const,
      dataDir: path.join(root, "data"),
      runtimeDir: path.join(root, "runtime"),
    };
    try {
      const plain = new ProfileService(createConfig({ ...flags, dev: false }));
      expect(await plain.ensureDev()).toBe(false);

      for (const slot of ["0.9.0", "0.10.0"]) {
        await fs.mkdir(path.join(root, "runtime", "comfyui", slot, "ComfyUI"), { recursive: true });
        await fs.writeFile(path.join(root, "runtime", "comfyui", slot, "ComfyUI", "main.py"), "");
      }
      const dev = new ProfileService(createConfig({ ...flags, dev: true }));
      expect(await dev.ensureDev()).toBe(true);
      expect(await dev.ensureDev()).toBe(false);
      const [listed] = await dev.list();
      expect(listed?.id).toBe("dev");
      expect(listed?.comfy).toEqual({ mode: "managed", slot: "0.10.0" });
      expect(listed?.folders.models[0]?.path).toBe(path.join(root, "runtime", "dev", "models"));
      expect((await fs.stat(path.join(root, "runtime", "dev", "outputs"))).isDirectory()).toBe(
        true,
      );
      expect((await dev.registry()).order).toEqual([]);
      // A profile named "Dev" never takes its id.
      const named = await dev.create({
        name: "Dev",
        accent: "blue",
        theme: "blombo",
        paths: { models: "", outputs: "", wildcards: "" },
        comfy: { mode: "managed", slot: "latest" },
        presets: [],
      });
      expect(named.id).toBe("dev-2");
      expect((await dev.list()).map((p) => p.id)).toEqual(["dev-2", "dev"]);

      expect((await plain.list()).map((p) => p.id)).toEqual(["dev-2"]);
      expect(await plain.find("dev")).toBeNull();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
