/**
 * Labeled image grids for prompt matrices and XY plots (sharp). Cells keep the first image's
 * aspect ratio, shrunk so the whole grid stays under a size image viewers handle; column labels
 * go above, row labels to the left, drawn as SVG text. A missing image (a failed or cancelled
 * run) leaves a gray cell that says so. The grid is a picture file, not UI, so its colors are
 * fixed here rather than coming from the app's theme.
 */
import sharp, { type OverlayOptions } from "sharp";

sharp.cache(false);

export interface GridInput {
  /** Row by row; null for a run that made no image. */
  images: Array<Uint8Array | null>;
  cols: number;
  rows: number;
  colLabels: string[];
  rowLabels: string[];
  title?: string;
}

/** The longest side of the finished grid. */
const MAX_SIDE = 8192;
const MAX_CELL = 1024;
const MIN_CELL = 256;
const BG = "#ffffff";
const INK = "#1d1d1f";
const MUTED = "#e9e9ec";

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Break a label into at most `lines` lines of about `width` characters. */
export function wrapLabel(text: string, width: number, lines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= width || !cur) cur = next;
    else {
      out.push(cur);
      cur = w;
    }
  }
  if (cur) out.push(cur);
  if (out.length > lines) {
    out.length = lines;
    out[lines - 1] = `${(out[lines - 1] ?? "").slice(0, Math.max(1, width - 1))}…`;
  }
  return out.map((l) => (l.length > width ? `${l.slice(0, Math.max(1, width - 1))}…` : l));
}

function textSvg(
  width: number,
  height: number,
  lines: string[],
  size: number,
  anchor: "middle" | "end",
): Buffer {
  const lh = Math.round(size * 1.25);
  const top = height / 2 - ((lines.length - 1) * lh) / 2 + size * 0.35;
  const x = anchor === "middle" ? width / 2 : width - Math.round(size * 0.8);
  const tspans = lines
    .map((l, i) => `<tspan x="${x}" y="${Math.round(top + i * lh)}">${escapeXml(l)}</tspan>`)
    .join("");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="${size}" fill="${INK}" text-anchor="${anchor}">${tspans}</text></svg>`,
  );
}

export async function composeGrid(input: GridInput): Promise<{
  png: Buffer;
  width: number;
  height: number;
}> {
  const first = input.images.find((i): i is Uint8Array => i !== null);
  let aspect = 1;
  let natural = MAX_CELL;
  if (first) {
    const meta = await sharp(first).metadata();
    if (meta.width && meta.height) {
      aspect = meta.width / meta.height;
      natural = meta.width;
    }
  }
  const hasRows = input.rowLabels.length > 0;
  const hasTitle = Boolean(input.title);
  // Cell size: the images' own size (small ones at least MIN_CELL wide, to stay readable), and
  // the grid never past MAX_SIDE.
  let cellW = Math.min(
    Math.max(MIN_CELL, Math.min(MAX_CELL, natural)),
    Math.floor(MAX_SIDE / (input.cols + (hasRows ? 0.6 : 0))),
  );
  let cellH = Math.round(cellW / aspect);
  const maxH = Math.floor(MAX_SIDE / (input.rows + 0.4));
  if (cellH > maxH) {
    cellH = maxH;
    cellW = Math.round(cellH * aspect);
  }
  const font = Math.max(14, Math.round(Math.min(cellW, cellH) / 18));
  const headH = Math.round(font * 4.2);
  const sideW = hasRows ? Math.round(Math.min(cellW * 0.6, font * 14)) : 0;
  const titleH = hasTitle ? Math.round(font * 2.4) : 0;
  const width = sideW + cellW * input.cols;
  const height = titleH + headH + cellH * input.rows;
  const chars = (w: number) => Math.max(6, Math.floor(w / (font * 0.56)));

  const layers: OverlayOptions[] = [];
  if (hasTitle)
    layers.push({
      input: textSvg(
        width,
        titleH,
        wrapLabel(input.title ?? "", chars(width), 1),
        Math.round(font * 1.1),
        "middle",
      ),
      top: 0,
      left: 0,
    });
  input.colLabels.forEach((label, c) => {
    layers.push({
      input: textSvg(cellW, headH, wrapLabel(label, chars(cellW), 3), font, "middle"),
      top: titleH,
      left: sideW + c * cellW,
    });
  });
  if (hasRows)
    input.rowLabels.forEach((label, r) => {
      layers.push({
        input: textSvg(sideW, cellH, wrapLabel(label, chars(sideW), 6), font, "end"),
        top: titleH + headH + r * cellH,
        left: 0,
      });
    });
  for (let r = 0; r < input.rows; r++)
    for (let c = 0; c < input.cols; c++) {
      const img = input.images[r * input.cols + c] ?? null;
      const top = titleH + headH + r * cellH;
      const left = sideW + c * cellW;
      if (img) {
        const cell = await sharp(img)
          .resize(cellW, cellH, { fit: "contain", background: BG })
          .flatten({ background: BG })
          .png()
          .toBuffer();
        layers.push({ input: cell, top, left });
      } else {
        const empty = await sharp({
          create: { width: cellW, height: cellH, channels: 3, background: MUTED },
        })
          .composite([
            { input: textSvg(cellW, cellH, ["No image"], font, "middle"), top: 0, left: 0 },
          ])
          .png()
          .toBuffer();
        layers.push({ input: empty, top, left });
      }
    }

  const png = await sharp({ create: { width, height, channels: 3, background: BG } })
    .composite(layers)
    .png({ compressionLevel: 6 })
    .toBuffer();
  return { png, width, height };
}
