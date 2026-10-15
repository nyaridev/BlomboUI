/**
 * Deterministic randomness. The same seed always gives the same sequence, so wildcard picks are
 * reproducible from an image's seed, and placeholder art stays stable per name.
 */

/** FNV-1a: a fast, stable 32-bit hash of a string. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small seeded PRNG returning floats in [0, 1). */
export function rng(seed: number | string): () => number {
  let a = typeof seed === "string" ? hashString(seed) : seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Largest seed ComfyUI's samplers accept (they take 64-bit; JSON-safe integers stop here). */
export const MAX_SEED = Number.MAX_SAFE_INTEGER;

/** A fresh random seed in the 32-bit range most UIs show. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}
