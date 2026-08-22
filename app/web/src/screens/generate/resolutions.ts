export const ASPECTS = [
  { id: '1:1', label: '1:1 (Square)', w: 1, h: 1 },
  { id: '2:3', label: '2:3 (Portrait Photo)', w: 2, h: 3 },
  { id: '3:2', label: '3:2 (Photo)', w: 3, h: 2 },
  { id: '3:4', label: '3:4 (Portrait Standard)', w: 3, h: 4 },
  { id: '4:3', label: '4:3 (Standard)', w: 4, h: 3 },
  { id: '9:16', label: '9:16 (Portrait Widescreen)', w: 9, h: 16 },
  { id: '16:9', label: '16:9 (Widescreen)', w: 16, h: 9 },
  { id: '21:9', label: '21:9 (Ultrawide)', w: 21, h: 9 },
] as const

export const SAMPLERS = [
  'euler',
  'euler_ancestral',
  'heun',
  'dpmpp_2m',
  'dpmpp_2m_sde',
  'dpmpp_sde',
  'dpmpp_2s_ancestral',
  'dpm_2',
  'lcm',
  'uni_pc',
] as const

export const SCHEDULERS = [
  'sgm_uniform',
  'simple',
  'normal',
  'karras',
  'exponential',
  'ddim_uniform',
  'beta',
] as const

export function listedChoices(all: readonly string[], hidden: readonly string[], keep: string) {
  return [...new Set([keep, ...all.filter((item) => !hidden.includes(item))])]
}

export type ResMode = 'raw' | 'scaler' | 'set'

export function isResMode(value: unknown): value is ResMode {
  return value === 'raw' || value === 'scaler' || value === 'set'
}

export const DEFAULT_SET_RESOLUTIONS = ['1024x1024', '1152x896', '1216x832', '1344x768', '1536x640']

export type Size = { w: number; h: number }

function snap8(value: number, min: number, max: number) {
  const snapped = Math.round(value / 8) * 8
  return Math.min(max, Math.max(min, snapped))
}

export function snapDim(value: number) {
  return snap8(value, 64, 4096)
}

export function parseSize(raw: string): Size | null {
  const match = String(raw).trim().match(/^(\d+)\s*[x×*]\s*(\d+)$/i)
  if (!match) {
    return null
  }
  const w = Number(match[1])
  const h = Number(match[2])
  if (!Number.isFinite(w) || !Number.isFinite(h)) {
    return null
  }
  return { w: snapDim(w), h: snapDim(h) }
}

export function formatSize(size: Size) {
  return `${size.w}x${size.h}`
}

export function landscapeSize(size: Size): Size {
  return size.w >= size.h ? size : { w: size.h, h: size.w }
}

export function orientSize(size: Size, vertical: boolean): Size {
  const land = landscapeSize(size)
  if (!vertical || land.w === land.h) {
    return land
  }
  return { w: land.h, h: land.w }
}

export function cleanSetResolutions(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const size = parseSize(String(item ?? ''))
    if (!size) {
      continue
    }
    const key = formatSize(landscapeSize(size))
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    out.push(key)
  }
  return out
}

export function snapToSet(width: number, height: number, sets: string[]): Size {
  const vertical = height > width
  const land = formatSize(landscapeSize({ w: snapDim(width), h: snapDim(height) }))
  const hit = sets.find((item) => item === land) || sets[0]
  const size = (hit && parseSize(hit)) || { w: snapDim(width), h: snapDim(height) }
  return orientSize(size, vertical)
}

export function sizeFromScaler(aspectId: string, megapixels: number) {
  const aspect = ASPECTS.find((item) => item.id === aspectId) ?? ASPECTS[3]
  const pixels = Math.max(0.2, megapixels) * 1_000_000
  const height = Math.sqrt(pixels * (aspect.h / aspect.w))
  const width = height * (aspect.w / aspect.h)
  return {
    width: snap8(width, 64, 4096),
    height: snap8(height, 64, 4096),
  }
}

export function inferScaler(width: number, height: number) {
  const ratio = width / height
  let best: (typeof ASPECTS)[number] = ASPECTS[0]
  let score = Infinity
  for (const aspect of ASPECTS) {
    const next = Math.abs(aspect.w / aspect.h - ratio)
    if (next < score) {
      best = aspect
      score = next
    }
  }
  const megapixels = Math.round(((width * height) / 1_000_000) * 20) / 20
  return { aspect: best.id, megapixels: Math.min(4, Math.max(0.2, megapixels)) }
}
