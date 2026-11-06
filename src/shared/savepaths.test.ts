import { describe, expect, it } from "vitest";
import {
  checkPattern,
  comfyPrefix,
  DEFAULT_PATHS,
  markerOf,
  nextNumber,
  resolvePattern,
  SAVE_KINDS,
  timeVars,
} from "./savepaths.ts";
import { SavingSettings } from "./settings.ts";

const vars = {
  ...timeVars(new Date(2026, 10, 6, 14, 22, 33)),
  workflow: "illustrious-xl",
  seed: 42,
  model: "a:b/c",
};

describe("save paths", () => {
  it("accepts the defaults and finds their marker folders", () => {
    for (const kind of SAVE_KINDS) expect(checkPattern(kind, DEFAULT_PATHS[kind])).toBeNull();
    expect(markerOf(DEFAULT_PATHS.grids)).toBe("grids");
    expect(markerOf(DEFAULT_PATHS.jpegCopies)).toBe("jpeg");
    expect(markerOf("[workflow]/[date]/x")).toBeNull();
  });

  it("says what's wrong with a pattern", () => {
    expect(checkPattern("images", "[workflow]/[seed]")).toMatch(/\[number\]/);
    expect(checkPattern("images", "../x_[number]")).toMatch(/\.\./);
    expect(checkPattern("images", "C:/x_[number]")).toMatch(/inside/);
    expect(checkPattern("images", "a/[name]_[number]")).toMatch(/\[name\]/);
    expect(checkPattern("grids", "[workflow]/[date]/[kind]")).toMatch(/fixed name/);
    expect(checkPattern("grids", "[workflow]/images/[kind]")).toMatch(/Images are saved/);
    expect(checkPattern("images", "a/b?_[number]")).toMatch(/Leave out/);
  });

  it("fills in placeholders safely", () => {
    expect(resolvePattern(DEFAULT_PATHS.images, { ...vars, number: "00001" })).toBe(
      "illustrious-xl/images/2026-11-06/blombo_00001",
    );
    expect(resolvePattern("[model]/[width]/x-[seed]", vars)).toBe("a_b_c/x-42");
    expect(comfyPrefix(DEFAULT_PATHS.images, vars)).toBe("illustrious-xl/images/2026-11-06/blombo");
    expect(comfyPrefix("[workflow]/[seed]-[number]", vars)).toBe("illustrious-xl/42-");
  });

  it("finds the next free number", () => {
    const names = ["batch-007.png", "batch-012.jpg", "xy-099.png", "batch-x.png"];
    expect(nextNumber("[kind]-[number]", { kind: "batch" }, names)).toBe("00013");
    expect(nextNumber("[kind]-[number]", { kind: "matrix" }, names)).toBe("00001");
  });

  it("falls back to the default for a pattern saved broken", () => {
    const s = SavingSettings.safeParse({ paths: { images: "[workflow]/x" } });
    expect(s.success).toBe(false);
    expect(SavingSettings.parse({}).paths.images).toBe(DEFAULT_PATHS.images);
  });
});
