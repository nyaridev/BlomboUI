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

function snap8(value: number, min: number, max: number) {
  const snapped = Math.round(value / 8) * 8
  return Math.min(max, Math.max(min, snapped))
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
  let best = ASPECTS[0]
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
