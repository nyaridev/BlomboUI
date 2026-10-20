import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SettingsService } from "./settings.ts";

let dir: string;
let service: SettingsService;
const file = () => path.join(dir, "p", "settings.json");

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-settings-"));
  await fs.mkdir(path.join(dir, "p"));
  service = new SettingsService((id) => path.join(dir, id));
});
afterEach(() => fs.rm(dir, { recursive: true, force: true }));

describe("SettingsService", () => {
  it("keeps both of two updates sent at once", async () => {
    await Promise.all([
      service.update("p", { appearance: { font: "inter" } }),
      service.update("p", { gallery: { tileSize: 300 } }),
      service.updateWith("p", (s) => ({
        gallery: { libraries: [...s.gallery.libraries, { id: "a", name: "A", path: "D:/a" }] },
      })),
      service.updateWith("p", (s) => ({
        gallery: { libraries: [...s.gallery.libraries, { id: "b", name: "B", path: "D:/b" }] },
      })),
    ]);
    const saved = JSON.parse(await fs.readFile(file(), "utf8"));
    expect(saved.appearance.font).toBe("inter");
    expect(saved.gallery.tileSize).toBe(300);
    expect(saved.gallery.libraries.map((l: { id: string }) => l.id)).toEqual(["a", "b"]);
  });

  it("keeps the rest of a file with one bad value, and a copy of the original", async () => {
    const original = JSON.stringify({
      version: 1,
      gallery: { tileSize: 999, libraries: [{ id: "a", name: "A", path: "D:/a" }] },
    });
    await fs.writeFile(file(), original);
    expect((await service.get("p")).gallery.libraries).toHaveLength(1);
    await service.update("p", { appearance: { font: "inter" } });
    const saved = JSON.parse(await fs.readFile(file(), "utf8"));
    expect(saved.gallery.libraries).toHaveLength(1);
    expect(saved.gallery.tileSize).toBe(400);
    const copies = (await fs.readdir(path.join(dir, "p"))).filter((n) =>
      n.startsWith("settings.invalid-"),
    );
    expect(copies).toHaveLength(1);
    expect(await fs.readFile(path.join(dir, "p", copies[0] as string), "utf8")).toBe(original);
  });

  it("never writes over a file from a newer version", async () => {
    const newer = JSON.stringify({ version: 2, appearance: { font: "inter" }, future: { x: 1 } });
    await fs.writeFile(file(), newer);
    expect((await service.get("p")).appearance.font).toBe("inter");
    await expect(service.update("p", { gallery: { tileSize: 300 } })).rejects.toMatchObject({
      code: "settings_newer",
    });
    expect(await fs.readFile(file(), "utf8")).toBe(newer);
  });

  it("rejects an invalid patch without touching the file", async () => {
    await service.update("p", { appearance: { font: "inter" } });
    await expect(service.update("p", { gallery: { tileSize: 5 } })).rejects.toMatchObject({
      code: "invalid_settings",
    });
    expect((await service.get("p")).appearance.font).toBe("inter");
  });
});
