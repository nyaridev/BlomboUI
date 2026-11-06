/**
 * Settings → Leftovers: things Blombo keeps for a model or wildcard that isn't there anymore.
 *
 *   model             a model's info and pictures beside a model file that's gone
 *                     (foo.civitai.info, foo.json with A1111 info, foo.preview.png, foo_data/)
 *   wildcard-picture  a picture set for a wildcard no folder defines anymore
 *   favorite          a heart on a model or wildcard that isn't there
 *
 * Clearing moves files to the profile's trash and forgets the favorites. A folder that isn't
 * there (a drive that's unplugged) is never judged: it's listed as skipped instead.
 */
import { z } from "zod";

export const LEFTOVER_KINDS = ["model", "wildcard-picture", "favorite"] as const;
export type LeftoverKind = (typeof LEFTOVER_KINDS)[number];

export const Leftover = z.object({
  /** Stable across scans; clearing names items by it. */
  id: z.string(),
  kind: z.enum(LEFTOVER_KINDS),
  /** What it belonged to ("Detailer", "outfits/fantasy", "loras · style/old.safetensors"). */
  name: z.string(),
  /** Where it is, or what it is ("B:/Models/loras/style · info, picture"). */
  detail: z.string(),
  /** Bytes on disk (0 for favorites). */
  size: z.number(),
});
export type Leftover = z.infer<typeof Leftover>;

export const LeftoverReport = z.object({
  items: z.array(Leftover),
  /** Folders that weren't there, so nothing in or for them was judged. */
  skipped: z.array(z.string()),
  scannedAt: z.number(),
});
export type LeftoverReport = z.infer<typeof LeftoverReport>;

export const ClearLeftoversBody = z.object({ ids: z.array(z.string().max(2000)).min(1).max(5000) });

export const ClearedLeftovers = z.object({
  /** Files and folders moved to the trash. */
  moved: z.number().int(),
  /** Favorites forgotten. */
  forgotten: z.number().int(),
});
export type ClearedLeftovers = z.infer<typeof ClearedLeftovers>;
