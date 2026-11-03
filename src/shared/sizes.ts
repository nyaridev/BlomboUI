/**
 * Image sizes for the Size picker, the old app's three ways: Raw (width and height), Scaler (an
 * aspect and a megapixel count) and Set (a list of known-good resolutions, turned horizontal or
 * vertical). Sizes snap to 8 px between 64 and 4096.
 */

export const SIZE_MODES = ["raw", "scaler", "set"] as const;
export type SizeMode = (typeof SIZE_MODES)[number];

export const ASPECTS = [
  { id: "1:1", label: "1:1 (Square)", w: 1, h: 1 },
  { id: "2:3", label: "2:3 (Portrait photo)", w: 2, h: 3 },
  { id: "3:2", label: "3:2 (Photo)", w: 3, h: 2 },
  { id: "3:4", label: "3:4 (Portrait standard)", w: 3, h: 4 },
  { id: "4:3", label: "4:3 (Standard)", w: 4, h: 3 },
  { id: "9:16", label: "9:16 (Portrait widescreen)", w: 9, h: 16 },
  { id: "16:9", label: "16:9 (Widescreen)", w: 16, h: 9 },
  { id: "21:9", label: "21:9 (Ultrawide)", w: 21, h: 9 },
] as const;

/** SDXL-family buckets, landscape side first. */
export const SET_RESOLUTIONS = ["1024x1024", "1152x896", "1216x832", "1344x768", "1536x640"];

export const MEGAPIXELS = { min: 0.2, max: 4, step: 0.05 } as const;

export type Size = { w: number; h: number };

const MEGAPIXEL_PIXELS = 1024 * 1024;

export function snapDim(value: number): number {
  return Math.min(4096, Math.max(64, Math.round(value / 8) * 8));
}

export function parseSize(raw: string): Size | null {
  const match = raw.trim().match(/^(\d+)\s*[x×*]\s*(\d+)$/i);
  if (!match) return null;
  return { w: snapDim(Number(match[1])), h: snapDim(Number(match[2])) };
}

export function formatSize(size: Size): string {
  return `${size.w}x${size.h}`;
}

export function landscapeSize(size: Size): Size {
  return size.w >= size.h ? size : { w: size.h, h: size.w };
}

export function orientSize(size: Size, vertical: boolean): Size {
  const land = landscapeSize(size);
  return vertical && land.w !== land.h ? { w: land.h, h: land.w } : land;
}

export function sizeFromScaler(aspectId: string, megapixels: number): Size {
  const aspect = ASPECTS.find((a) => a.id === aspectId) ?? ASPECTS[0];
  const pixels = Math.max(MEGAPIXELS.min, megapixels) * MEGAPIXEL_PIXELS;
  const h = Math.sqrt(pixels * (aspect.h / aspect.w));
  return { w: snapDim(h * (aspect.w / aspect.h)), h: snapDim(h) };
}

/** The closest aspect and megapixel count (to 0.05) for a size. */
export function inferScaler(size: Size): { aspect: string; megapixels: number } {
  const ratio = size.w / size.h;
  let best: (typeof ASPECTS)[number] = ASPECTS[0];
  for (const a of ASPECTS)
    if (Math.abs(a.w / a.h - ratio) < Math.abs(best.w / best.h - ratio)) best = a;
  const mp = Math.round(((size.w * size.h) / MEGAPIXEL_PIXELS) * 20) / 20;
  return { aspect: best.id, megapixels: Math.min(MEGAPIXELS.max, Math.max(MEGAPIXELS.min, mp)) };
}
