import path from "node:path";
import { describe, expect, it } from "vitest";
import { outputName, samePath } from "./batch.ts";

describe("batch output names", () => {
  it("keeps only the file name of what was sent", () => {
    expect(outputName("photo.png")).toBe("photo.png");
    expect(outputName("..\\..\\Users\\me\\Documents\\notes.png")).toBe("notes.png");
    expect(outputName("../../etc/passwd")).toBe("passwd");
    expect(outputName("a:b.png")).toBe("a_b.png");
    expect(outputName("..")).toBeNull();
    expect(outputName("dir/")).toBeNull();
    expect(outputName(undefined)).toBeNull();
  });

  it("compares paths the way the file system does", () => {
    const dir = path.resolve("x");
    expect(samePath(path.join(dir, "a.png"), path.join(dir, ".", "a.png"))).toBe(true);
    expect(samePath(path.join(dir, "Photo.PNG"), path.join(dir, "Photo.png"))).toBe(
      process.platform === "win32",
    );
  });
});
