/** Number helpers shared by Slider, ScrubField and NumberField. */

/** 1536 → "1.5 KB", 2.1e9 → "1.96 GB". */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function decimalsOf(step: number): number {
  if (!Number.isFinite(step) || step >= 1) return 0;
  const text = step.toString();
  if (text.includes("e-")) return Number(text.split("e-")[1]);
  return text.split(".")[1]?.length ?? 0;
}

/** Snap to the step grid anchored at `min`, then clamp. Avoids 0.30000000000000004. */
export function snap(value: number, step: number, min: number, max: number): number {
  const snapped = step > 0 ? Math.round((value - min) / step) * step + min : value;
  return Number(clamp(snapped, min, max).toFixed(decimalsOf(step)));
}

export function formatNumber(value: number, step: number): string {
  return value.toFixed(decimalsOf(step));
}

/** Parse what a person typed: accepts "1,5" and simple math like "512*2" or "(832+64)/2". */
export function parseNumberInput(text: string): number | null {
  const src = text.trim().replace(",", ".").replace(/\s+/g, "");
  if (!src || !/^[-+*/().\d]+$/.test(src)) return null;
  let i = 0;
  const peek = () => src[i];
  const num = (): number => {
    if (peek() === "(") {
      i++;
      const v = expr();
      if (peek() !== ")") throw new Error("paren");
      i++;
      return v;
    }
    if (peek() === "-" || peek() === "+") {
      const sign = src[i++] === "-" ? -1 : 1;
      return sign * num();
    }
    const m = /^\d*\.?\d+|^\d+\.?/.exec(src.slice(i));
    if (!m) throw new Error("number");
    i += m[0].length;
    return Number(m[0]);
  };
  const term = (): number => {
    let v = num();
    while (peek() === "*" || peek() === "/") v = src[i++] === "*" ? v * num() : v / num();
    return v;
  };
  const expr = (): number => {
    let v = term();
    while (peek() === "+" || peek() === "-") v = src[i++] === "+" ? v + term() : v - term();
    return v;
  };
  try {
    const value = expr();
    return i === src.length && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** Time left for a download at its current speed ("3 min left"), or null. */
export function formatEta(remaining: number, speed: number): string | null {
  if (speed <= 0 || remaining <= 0) return null;
  const s = Math.round(remaining / speed);
  if (s < 60) return `${s} s left`;
  if (s < 3600) return `${Math.round(s / 60)} min left`;
  return `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min left`;
}
