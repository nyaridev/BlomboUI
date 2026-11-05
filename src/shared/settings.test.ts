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
    expect(s.appearance.font).toBe("segoe");
    expect(s.gallery.layout).toBe("justified");
    expect(s.civitai.downloads.aliases).toEqual([]);
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

  it("gives older files the Civitai defaults and drops the old NSFW blur", () => {
    const s = migrateSettings({
      models: { blurNsfw: false },
      civitai: { browse: { nsfw: false } },
    });
    expect("models" in s).toBe(false);
    expect("nsfw" in s.civitai.browse).toBe(false);
    expect(s.civitai.downloads.folderBy).toEqual(["baseModel", "category", "creator"]);
    expect(s.civitai.downloads).toMatchObject({ naming: "model", prefix: true, autoAliases: true });
    expect(s.civitai.browse.period).toBe("AllTime");
    expect(s.civitai.lookup).toBe(true);
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
      gallery: { tileSize: 500 },
      civitai: { downloads: { aliases: [{ from: "renders", to: "Renders" }] } },
      appearance: { font: "inter" },
    });
    expect(r.settings.gallery.tileSize).toBe(400);
    expect(r.settings.civitai.downloads.aliases).toHaveLength(1);
    expect(r.settings.appearance.font).toBe("inter");
    expect(r.dropped).toEqual(["gallery.tileSize"]);
    expect(r.newer).toBe(false);
  });

  it("drops one bad list item and keeps the rest", () => {
    const r = readSettings({
      civitai: {
        downloads: {
          aliases: [
            { from: "a", to: "A" },
            { from: 5, to: "" },
            { from: "c", to: "C" },
          ],
        },
      },
    });
    expect(r.settings.civitai.downloads.aliases.map((l) => l.from)).toEqual(["a", "c"]);
  });

  it("reads followed creators saved as plain names, and drops pictures from elsewhere", () => {
    const r = readSettings({
      civitai: {
        following: [
          "old_name",
          { username: "pixelsmith", image: "/api/civitai/image?u=aHR0cHM6Ly9h" },
          { username: "evil", image: "https://example.com/x.png" },
        ],
      },
    });
    expect(r.settings.civitai.following).toEqual([
      { username: "old_name", image: null },
      { username: "pixelsmith", image: "/api/civitai/image?u=aHR0cHM6Ly9h" },
      { username: "evil", image: null },
    ]);
  });

  it("starts the Set list with the SDXL sizes and drops a bad one from a saved list", () => {
    expect(Settings.parse({}).generate.setResolutions).toContain("1216x832");
    const r = readSettings({ generate: { setResolutions: ["1280x832", "huge", "896x640"] } });
    expect(r.settings.generate.setResolutions).toEqual(["1280x832", "896x640"]);
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
