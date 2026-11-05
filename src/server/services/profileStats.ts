/**
 * A profile's numbers for the profile screen: images in its gallery index, favorites and runs
 * (job log). The database is opened read-only on its own connection, so looking never creates,
 * migrates or locks anything: a profile that was never opened (no database yet) or an older one
 * missing a table just counts zero there.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ProfileStats } from "../../shared/profile.ts";

export async function readProfileStats(profileDir: string): Promise<ProfileStats> {
  const stats: ProfileStats = { images: 0, favorites: 0, runs: 0 };
  const file = path.join(profileDir, "blombo.sqlite");
  if (!(await fs.stat(file).catch(() => null))) return stats;
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(file, { readOnly: true });
  } catch {
    return stats;
  }
  const one = (sql: string): Record<string, unknown> => {
    try {
      return (db.prepare(sql).get() as Record<string, unknown> | undefined) ?? {};
    } catch {
      return {};
    }
  };
  try {
    stats.images = Number(one("SELECT COUNT(*) AS n FROM images").n ?? 0);
    stats.favorites = Number(one("SELECT COUNT(*) AS n FROM marks WHERE favorite = 1").n ?? 0);
    stats.runs = Number(one("SELECT COUNT(*) AS n FROM job_log").n ?? 0);
  } finally {
    db.close();
  }
  return stats;
}
