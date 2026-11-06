/**
 * Pixel helpers for MaskPainter. While painting, the mask is white ink whose alpha is the mask;
 * saved, it's an opaque black-and-white PNG (white = redraw), which ComfyUI's LoadImageMask reads
 * from the red channel. These turn one into the other and map the pointer into image pixels.
 */

/** A saved mask (black and white) → painting ink: white, with the brightness as alpha. In place. */
export function maskToInk(px: Uint8ClampedArray): Uint8ClampedArray {
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i] ?? 0;
    px[i] = 255;
    px[i + 1] = 255;
    px[i + 2] = 255;
    px[i + 3] = a;
  }
  return px;
}

/** Painting ink → the mask to save: the alpha as gray, fully opaque. In place. */
export function inkToMask(px: Uint8ClampedArray): Uint8ClampedArray {
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3] ?? 0;
    px[i] = a;
    px[i + 1] = a;
    px[i + 2] = a;
    px[i + 3] = 255;
  }
  return px;
}

/** Painting ink with every pixel's alpha flipped (what was masked is kept). In place. */
export function invertInk(px: Uint8ClampedArray): Uint8ClampedArray {
  for (let i = 0; i < px.length; i += 4) {
    px[i] = 255;
    px[i + 1] = 255;
    px[i + 2] = 255;
    px[i + 3] = 255 - (px[i + 3] ?? 0);
  }
  return px;
}

/** Whether any pixel is painted. */
export function hasInk(px: Uint8ClampedArray): boolean {
  for (let i = 3; i < px.length; i += 4) if ((px[i] ?? 0) > 0) return true;
  return false;
}

/** A pointer position on the shown picture → image pixels (the picture may be scaled). */
export function toImagePoint(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  width: number,
  height: number,
): { x: number; y: number } {
  return {
    x: ((clientX - rect.left) / Math.max(1, rect.width)) * width,
    y: ((clientY - rect.top) / Math.max(1, rect.height)) * height,
  };
}

/** A brush size that suits the image: 4% of its shorter side, at least 4 px. */
export function defaultBrush(width: number, height: number): number {
  return Math.max(4, Math.round(Math.min(width, height) * 0.04));
}
