import { describe, expect, it } from "vitest";
import {
  fontStack,
  mergeSettings,
  migrateSettings,
  readSettings,
  Settings,
  SettingsPatch,
} from "./settings.ts";

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

  it("gives older files the Generate and autocomplete defaults", () => {
    const s = migrateSettings({ appearance: { font: "inter" } });
    expect(s.generate.layout).toBe("default");
    expect(s.autocomplete.enabled).toBe(true);
    expect(s.autocomplete.sources.loras).toBe(true);
    expect(s.autocomplete.weightStep).toBe(0.05);
    const next = mergeSettings(
      s,
      SettingsPatch.parse({ autocomplete: { sources: { tags: false } } }),
    );
    expect(next.autocomplete.sources.tags).toBe(false);
    expect(next.autocomplete.sources.wildcards).toBe(true);
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

describe("readSettings", () => {
  it("pulls an out-of-range value to its limit and keeps the rest", () => {
    const r = readSettings({
      version: 1,
      gallery: {
        tileSize: 500,
        libraries: [{ id: "renders", name: "Renders", path: "D:/renders" }],
      },
      appearance: { font: "inter" },
    });
    expect(r.settings.gallery.tileSize).toBe(400);
    expect(r.settings.gallery.libraries).toHaveLength(1);
    expect(r.settings.appearance.font).toBe("inter");
    expect(r.dropped).toEqual(["gallery.tileSize"]);
    expect(r.newer).toBe(false);
  });

  it("drops one bad list item and keeps the rest", () => {
    const r = readSettings({
      gallery: {
        libraries: [
          { id: "a", name: "A", path: "D:/a" },
          { id: 5, name: "", path: 3 },
          { id: "c", name: "C", path: "D:/c" },
        ],
      },
    });
    expect(r.settings.gallery.libraries.map((l) => l.id)).toEqual(["a", "c"]);
  });

  it("flags a file from a newer version", () => {
    const r = readSettings({ version: 9, appearance: { font: "inter" } });
    expect(r.newer).toBe(true);
    expect(r.settings.appearance.font).toBe("inter");
  });

  it("reads garbage as defaults", () => {
    expect(readSettings("nope").settings.gallery.tileSize).toBe(220);
    expect(readSettings({ gallery: 7 }).settings.gallery.tileSize).toBe(220);
  });
});
