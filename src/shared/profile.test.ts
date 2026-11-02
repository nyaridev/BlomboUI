import { describe, expect, it } from "vitest";
import {
  CreateProfileBody,
  folderIdFrom,
  mainFolder,
  migrateProfile,
  Profile,
  slugifyProfileName,
  UpdateProfileBody,
} from "./profile.ts";

describe("slugifyProfileName", () => {
  it("lowercases and dashes words", () => {
    expect(slugifyProfileName("Night Owl")).toBe("night-owl");
  });
  it("strips accents and symbols", () => {
    expect(slugifyProfileName("  Café — Ünïcode!! ")).toBe("cafe-unicode");
  });
  it("falls back when nothing is left", () => {
    expect(slugifyProfileName("✦✦✦")).toBe("profile");
  });
});

describe("CreateProfileBody", () => {
  it("fills defaults", () => {
    const body = CreateProfileBody.parse({
      name: "Main",
      paths: { models: "B:/Models", outputs: "", wildcards: "" },
    });
    expect(body.accent).toBe("blue");
    expect(body.comfy).toEqual({ mode: "managed", slot: "latest" });
    expect(body.presets).toEqual([]);
  });
  it("rejects an empty name", () => {
    expect(() => CreateProfileBody.parse({ name: "  ", paths: {} })).toThrow();
  });
});

describe("UpdateProfileBody", () => {
  it("keeps only the fields that were sent", () => {
    expect(UpdateProfileBody.parse({ theme: "light" })).toEqual({ theme: "light" });
    const models = [{ id: "m", name: "M", path: "D:/M" }];
    expect(UpdateProfileBody.parse({ folders: { models } })).toEqual({ folders: { models } });
  });
  it("refuses two folders of a kind with the same id", () => {
    const twice = [
      { id: "a", name: "A", path: "D:/A" },
      { id: "a", name: "B", path: "D:/B" },
    ];
    expect(() => UpdateProfileBody.parse({ folders: { models: twice } })).toThrow(
      /Two models folders use the id/,
    );
  });
});

describe("folders", () => {
  it("makes free ids from names", () => {
    expect(folderIdFrom("SDXL LoRAs", [])).toBe("sdxl-loras");
    expect(folderIdFrom("SDXL LoRAs", ["sdxl-loras"])).toBe("sdxl-loras-2");
    expect(folderIdFrom("✦", [], "library")).toBe("library");
  });

  it("moves a version 1 profile to folder lists, libraries after the main output folder", () => {
    const v1 = {
      id: "anime",
      name: "Anime",
      createdAt: "2026-01-01T00:00:00.000Z",
      paths: { models: "B:/AI/Models", outputs: "B:/AI/Output", wildcards: "" },
    };
    const libraries = [
      { id: "renders", name: "Renders", path: "D:/renders" },
      { id: "outputs", name: "Clash", path: "D:/clash" },
      { id: 3 },
    ];
    const profile = Profile.parse(migrateProfile(v1, libraries));
    expect(profile.version).toBe(2);
    expect(profile.folders.models).toEqual([
      { id: "models", name: "Models", path: "B:/AI/Models" },
    ]);
    expect(profile.folders.outputs.map((f) => f.id)).toEqual(["outputs", "renders"]);
    expect(profile.folders.wildcards).toEqual([]);
    expect(mainFolder(profile, "outputs")).toBe("B:/AI/Output");
    expect(mainFolder(profile, "wildcards")).toBe("");
    // A version 2 file passes through untouched.
    expect(migrateProfile(profile)).toBe(profile);
  });
});
