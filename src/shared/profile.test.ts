import { describe, expect, it } from "vitest";
import { CreateProfileBody, slugifyProfileName } from "./profile.ts";

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
