export function modelFileName(path: string) {
  return path.split(/[\\/]/).pop() || path
}

export function loraRange(min: number, max: number): [number, number] {
  return min <= max ? [min, max] : [max, min]
}

export function clampLora(value: number, min: number, max: number) {
  const [lo, hi] = loraRange(min, max)
  return Math.min(hi, Math.max(lo, value))
}
