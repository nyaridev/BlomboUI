/**
 * Procedural placeholder "renders" for previews, empty states and the Design Lab. Layered
 * radial light over a deep base plus film grain, seeded so each id always looks the same.
 * Real images replace these once the gallery and job pipeline exist.
 */
import { cn } from "@client/lib/cn";
import { rng } from "@client/lib/seeded";
import { type CSSProperties, useMemo } from "react";

const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .5 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

const PALETTES: Array<[number, number]> = [
  [215, 28], // dusk blue → amber
  [265, 330], // violet → pink
  [190, 150], // teal → green
  [12, 40], // ember
  [230, 200], // night sea
  [300, 260], // orchid
  [160, 50], // moss → gold
];

export function artStyle(seed: string): CSSProperties {
  const r = rng(seed);
  const [h1, h2] = PALETTES[Math.floor(r() * PALETTES.length)] ?? [215, 28];
  const spot = (h: number, s: number, l: number, a: number) => {
    const x = Math.round(r() * 100);
    const y = Math.round(r() * 100);
    const size = Math.round(35 + r() * 45);
    return `radial-gradient(${size}% ${size}% at ${x}% ${y}%, hsl(${h} ${s}% ${l}% / ${a}), transparent 70%)`;
  };
  const angle = Math.round(r() * 360);
  return {
    backgroundImage: [
      GRAIN,
      spot(h2, 90, 62, 0.85),
      spot(h1, 80, 55, 0.75),
      spot((h1 + h2) / 2, 70, 70, 0.4),
      spot(h2 + 20, 85, 50, 0.5),
      `linear-gradient(${angle}deg, hsl(${h1} 45% 12%), hsl(${h2} 40% 18%))`,
    ].join(","),
    backgroundSize: "160px 160px, cover, cover, cover, cover, cover",
    backgroundBlendMode: "overlay, screen, screen, screen, normal, normal",
  };
}

/** Keep `relative` for children unless the caller positions the element itself. */
export function positioned(className?: string): string {
  return /\b(absolute|fixed|sticky)\b/.test(className ?? "") ? "" : "relative";
}

export function Art({
  seed,
  className,
  ratio,
  children,
}: {
  seed: string;
  className?: string;
  /** width / height, e.g. 832/1216 */
  ratio?: number;
  children?: React.ReactNode;
}) {
  const style = useMemo(() => artStyle(seed), [seed]);
  return (
    <div
      className={cn(positioned(className), "overflow-hidden bg-sunken", className)}
      style={{ ...style, aspectRatio: ratio ? String(ratio) : undefined }}
    >
      {children}
    </div>
  );
}
