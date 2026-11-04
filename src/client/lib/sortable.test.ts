import { describe, expect, it } from "vitest";
import { moveItem, passed } from "./sortable";

const box = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

describe("passed", () => {
  it("swaps equal tiles as soon as the pointer is over the next one", () => {
    const me = box(0, 0, 100, 150);
    expect(passed(me, box(108, 0, 100, 150), 110, 50, true)).toBe(true);
    expect(passed(box(108, 0, 100, 150), box(0, 0, 100, 150), 98, 50, false)).toBe(true);
  });

  it("waits for a taller row until the pointer is where the dragged one will be", () => {
    // A 30 px row dragged down onto a 100 px one: only its last 30 px take it.
    const me = box(0, 0, 400, 30);
    const tall = box(0, 30, 400, 100);
    expect(passed(me, tall, 10, 60, true)).toBe(false);
    expect(passed(me, tall, 10, 101, true)).toBe(true);
    // After the swap the tall row sits on top (0–100), the short one under it (100–130): the
    // pointer at 101 is in the short one's place, so nothing swaps back.
    expect(passed(box(0, 100, 400, 30), box(0, 0, 400, 100), 10, 101, false)).toBe(false);
  });
});

describe("moveItem", () => {
  it("moves one item and keeps the rest in order", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });
});
