import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { shuffled, takeImages } from "./home.ts";
import { shuffleKey } from "./index.ts";

describe("gallery shuffle", () => {
  it("shuffles the same way for one seed and another way for the next", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE images (id INTEGER PRIMARY KEY)");
    const insert = db.prepare("INSERT INTO images (id) VALUES (?)");
    for (let id = 1; id <= 200; id++) insert.run(id);
    const order = (seed: number) =>
      (
        db.prepare(`SELECT id FROM images i ORDER BY ${shuffleKey(seed)}, i.id`).all() as Array<{
          id: number;
        }>
      ).map((r) => Number(r.id));
    const a = order(7);
    expect(order(7)).toEqual(a);
    expect([...a].sort((x, y) => x - y)).toEqual(Array.from({ length: 200 }, (_, i) => i + 1));
    expect(a).not.toEqual([...a].sort((x, y) => x - y));
    expect(order(8)).not.toEqual(a);
    // Neighbours by id land far apart, not in runs.
    const runs = a.filter((id, i) => i > 0 && Math.abs(id - (a[i - 1] ?? 0)) === 1).length;
    expect(runs).toBeLessThan(10);
    db.close();
  });

  it("gives cards that share images different ones side by side", () => {
    const all = ["a", "b", "c", "d"];
    const used = new Map<string, number>();
    const cards = [1, 2, 3, 4, 5].map((seed) => takeImages(shuffled(all, seed), used));
    // Four cards open on four different pictures; the fifth has to repeat one.
    expect(new Set(cards.slice(0, 4).map((c) => c[0])).size).toBe(4);
    expect(cards.every((c) => c.length === 4)).toBe(true);
    expect(shuffled(all, 1)).toEqual(shuffled(all, 1));
    expect(shuffled(["a", "b", "c", "d", "e", "f", "g", "h"], 1)).not.toEqual(
      shuffled(["a", "b", "c", "d", "e", "f", "g", "h"], 2),
    );
  });
});
