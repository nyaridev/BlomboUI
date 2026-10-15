import { describe, expect, it } from "vitest";
import { fontStack, mergeSettings, migrateSettings, Settings, SettingsPatch } from "./settings.ts";

describe("settings", () => {
  it("fills every default from an empty file", () => {
    const s = migrateSettings({});
    expect(s.appearance.font).toBe("geist");
    expect(s.gallery.layout).toBe("justified");
    expect(s.gallery.libraries).toEqual([]);
    expect(s.models.blurNsfw).toBe(true);
  });

  it("merges a patch without resetting other fields", () => {
    const base = Settings.parse({ gallery: { tileSize: 300 } });
    const next = mergeSettings(base, SettingsPatch.parse({ appearance: { font: "inter" } }));
    expect(next.appearance.font).toBe("inter");
    expect(next.gallery.tileSize).toBe(300);
  });

  it("merges nested sections key by key and replaces arrays", () => {
    const base = Settings.parse({
      civitai: { browse: { sort: "Newest", period: "Week" }, downloads: { folderBy: ["creator"] } },
    });
    const next = mergeSettings(
      base,
      SettingsPatch.parse({
        civitai: { browse: { period: "Year" }, downloads: { folderBy: ["baseModel"] } },
      }),
    );
    expect(next.civitai.browse.sort).toBe("Newest");
    expect(next.civitai.browse.period).toBe("Year");
    expect(next.civitai.downloads.folderBy).toEqual(["baseModel"]);
    expect(next.civitai.downloads.parallel).toBe(2);
  });

  it("gives older files the Civitai defaults", () => {
    const s = migrateSettings({ models: { blurNsfw: false } });
    expect(s.civitai.browse.nsfw).toBe(true);
    expect(s.civitai.downloads.folderBy).toEqual(["baseModel"]);
    expect(s.civitai.lookup).toBe(true);
    expect(s.models.blurNsfw).toBe(false);
  });

  it("rejects invalid values and unknown sections", () => {
    const base = Settings.parse({});
    expect(() => mergeSettings(base, { appearance: { font: "comic" } })).toThrow();
    expect(SettingsPatch.safeParse({ nope: {} }).success).toBe(false);
  });

  it("builds a safe custom font stack", () => {
    expect(fontStack("custom", 'Fira "Sans";')).toBe(
      '"Fira Sans", "Geist Variable", "Segoe UI", system-ui, sans-serif',
    );
    expect(fontStack("custom", "  ")).toBeNull();
    expect(fontStack("geist", "x")).toBeNull();
  });
});
