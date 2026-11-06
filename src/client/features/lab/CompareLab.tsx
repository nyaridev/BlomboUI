/**
 * The Design Lab's ImageCompare samples: the three ways to look at two images (flip, slider, side
 * by side) on two drawn pictures that differ in color and in one detail. Kept out of
 * DesignLab.tsx, which is long already.
 */
import { type CompareMode, ImageCompare, Segmented } from "@client/ui";
import { useState } from "react";

// Lab samples only (data, not UI color): two little scenes, the second warmer with a second moon.
const scene = (sky: string, ground: string, moons: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 400"><rect width="320" height="400" fill="${sky}"/><circle cx="210" cy="120" r="44" fill="#fde7a8"/>${moons > 1 ? '<circle cx="90" cy="80" r="18" fill="#fde7a8"/>' : ""}<path d="M0 300 Q160 220 320 300 V400 H0Z" fill="${ground}"/></svg>`,
  )}`;
const A = { src: scene("#28324f", "#141a2c", 1), label: "A · euler" };
const B = { src: scene("#6a3d5c", "#2a1830", 2), label: "B · heun" };

const MODES: Array<{ value: CompareMode; label: string }> = [
  { value: "flip", label: "Flip" },
  { value: "slider", label: "Slider" },
  { value: "side", label: "Side by side" },
];

export function CompareLab() {
  const [mode, setMode] = useState<CompareMode>("slider");
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <Segmented size="sm" label="How to compare" options={MODES} value={mode} onChange={setMode} />
      <ImageCompare mode={mode} a={A} b={B} className="h-80 rounded-lg bg-sunken" />
    </div>
  );
}
