/**
 * Contrast of the design tokens, read straight from tokens.css (no browser): every theme's
 * values, `var()` references resolved, and the WCAG contrast ratio of a text token on a
 * surface. Used by contrast.test.ts so a token change can't quietly make text unreadable.
 */
export type TokenMap = Record<string, string>;

/** Custom properties of each `[data-x="…"]` / `:root` block, in file order. */
export function parseBlocks(css: string): Array<{ selector: string; vars: TokenMap }> {
  const out: Array<{ selector: string; vars: TokenMap }> = [];
  const block = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(block)) {
    const vars: TokenMap = {};
    for (const d of (m[2] ?? "").matchAll(/--([\w-]+)\s*:\s*([^;]+);/g))
      vars[d[1] as string] = (d[2] as string).trim();
    out.push({ selector: (m[1] ?? "").trim(), vars });
  }
  return out;
}

/** The tokens one theme + accent sees (later blocks win, like the cascade). */
export function tokensFor(css: string, theme: string, accent: string): TokenMap {
  const map: TokenMap = {};
  for (const { selector, vars } of parseBlocks(css)) {
    const applies = selector
      .split(",")
      .map((s) => s.trim())
      .some(
        (s) =>
          s === ":root" || s === `[data-theme="${theme}"]` || s === `[data-accent="${accent}"]`,
      );
    if (applies) Object.assign(map, vars);
  }
  return map;
}

export function resolve(map: TokenMap, name: string, depth = 0): string | null {
  const value = map[name];
  if (value === undefined || depth > 10) return null;
  const ref = /^var\(--([\w-]+)\)$/.exec(value);
  return ref ? resolve(map, ref[1] as string, depth + 1) : value;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio of two #rrggbb colors, or null when either isn't one. */
export function contrast(a: string, b: string): number | null {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  if (!x || !y) return null;
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
