import { describe, expect, it } from "vitest";
import { MAX_PARTS, partWindow, videoParts } from "./videoparts.ts";

const file = { seconds: 30, fps: 30 };

describe("videoParts", () => {
  it("counts the frames and parts a window makes", () => {
    expect(videoParts({ start: 0, seconds: 2.7 }, file, 81)).toMatchObject({
      frames: 81,
      parts: 1,
    });
    // 150 frames: 81, then 76 more per part (5 shared).
    expect(videoParts({ start: 0, seconds: 5 }, file, 81)).toMatchObject({
      seconds: 5,
      frames: 150,
      parts: 2,
      shortened: false,
    });
  });

  it("keeps the window inside the file", () => {
    expect(videoParts({ start: 28, seconds: 5 }, file, 81)).toMatchObject({
      start: 28,
      seconds: 2,
      frames: 60,
      parts: 1,
    });
    expect(videoParts({ start: 0, seconds: 0 }, { seconds: 2, fps: 24 }, 81)).toMatchObject({
      seconds: 2,
      frames: 48,
    });
  });

  it("shortens a window that needs more than MAX_PARTS", () => {
    const p = videoParts({ start: 0, seconds: 60 }, { seconds: 120, fps: 30 }, 81);
    expect(p).toMatchObject({ parts: MAX_PARTS, shortened: true });
    expect(p.frames).toBe(81 + (MAX_PARTS - 1) * 76);
  });
});

describe("partWindow", () => {
  it("starts the first part at the start, at most one part long", () => {
    expect(partWindow({ start: 4, seconds: 5 }, 30, 81, 0)).toEqual({ start: 4, seconds: 2.7 });
  });

  it("starts each next part 5 frames before the end of what was made, up to the wanted end", () => {
    // 81 frames made: the next part starts at frame 76 (a quarter frame early).
    expect(partWindow({ start: 4, seconds: 5 }, 30, 81, 81)).toEqual({
      start: 6.525,
      seconds: 2.475,
    });
    // Without a length it reads a whole part.
    expect(partWindow({ start: 0, seconds: 0 }, 30, 81, 81).seconds).toBe(2.7);
  });
});
