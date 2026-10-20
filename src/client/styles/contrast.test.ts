/**
 * Text stays readable in every theme and accent (WCAG contrast, on every surface a text token
 * sits on): body, labels, muted text, status and syntax colors 4.5:1; hints, counts and disabled
 * text (fg-4) 3:1; text on the accent fill 4.5:1.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ACCENTS, THEMES } from "@shared/constants";
import { describe, expect, it } from "vitest";
import { contrast, resolve, tokensFor } from "./contrast";

const css = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "tokens.css"),
  "utf8",
);
const SURFACES = ["bg", "surface", "surface-2", "surface-3", "field"];
const TEXT = [
  "fg",
  "fg-2",
  "fg-3",
  "red-ink",
  "orange-ink",
  "yellow-ink",
  "green-ink",
  "cyan-ink",
  "blue-ink",
  "purple-ink",
  "pink-ink",
  "generate-ink",
  "syn-weight",
  "syn-lora",
  "syn-wildcard",
  "syn-break",
  "syn-escape",
  "syn-invalid",
];

function lowest(theme: string, accent: string, token: string): { ratio: number; on: string } {
  const t = tokensFor(css, theme, accent);
  let worst = { ratio: Number.POSITIVE_INFINITY, on: "" };
  for (const s of SURFACES) {
    const r = contrast(resolve(t, token) ?? "", resolve(t, s) ?? "");
    if (r !== null && r < worst.ratio) worst = { ratio: r, on: s };
  }
  return worst;
}

describe("token contrast", () => {
  for (const theme of THEMES) {
    it(`${theme}: text tokens read on every surface`, () => {
      const low: string[] = [];
      for (const token of TEXT) {
        const w = lowest(theme, "blue", token);
        if (w.ratio < 4.5) low.push(`${token} on ${w.on}: ${w.ratio.toFixed(2)}`);
      }
      const hint = lowest(theme, "blue", "fg-4");
      if (hint.ratio < 3) low.push(`fg-4 on ${hint.on}: ${hint.ratio.toFixed(2)}`);
      expect(low).toEqual([]);
    });

    it(`${theme}: every accent's ink and the text on its fill read`, () => {
      const low: string[] = [];
      for (const accent of ACCENTS) {
        const t = tokensFor(css, theme, accent);
        const on = contrast(resolve(t, "on-accent") ?? "", resolve(t, "accent") ?? "");
        if (on === null || on < 4.5) low.push(`${accent} on-accent: ${on?.toFixed(2)}`);
        const ink = lowest(theme, accent, "accent-ink");
        if (ink.ratio < 4.5) low.push(`${accent} accent-ink on ${ink.on}: ${ink.ratio.toFixed(2)}`);
      }
      expect(low).toEqual([]);
    });
  }
});
