import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { createConfig } from "../config.ts";
import { createServices, type Services } from "../context.ts";

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
