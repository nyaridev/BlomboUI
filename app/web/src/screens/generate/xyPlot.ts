import type { SelectOption } from '@/components/primitives/selectNav.ts'

export const XY_SHARED_TYPES = new Set(['lora', 'prompt_sr'])

export type XyAxisType =
  | 'none'
  | 'checkpoint'
  | 'vae'
  | 'text_encoder'
  | 'lora'
  | 'sampler'
  | 'scheduler'
  | 'resolution'
  | 'steps'
  | 'cfg'
  | 'seed'
  | 'prompt_sr'

export type XyAxisSettings = {
  type: XyAxisType
  values: string[]
}

export type XyPlotSettings = {
  x: XyAxisSettings
  y: XyAxisSettings
  drawLegend: boolean
  drawType: boolean
  keepMinusOne: boolean
  includeSubImages: boolean
  respectInstantLora: boolean
  gridMargin: number
}

export const DEFAULT_XY_PLOT: XyPlotSettings = {
  x: { type: 'none', values: [] },
  y: { type: 'none', values: [] },
  drawLegend: true,
  drawType: false,
  keepMinusOne: false,
  includeSubImages: true,
  respectInstantLora: false,
  gridMargin: 0,
}

const TYPE_DEFS: { value: XyAxisType; label: string; params?: string[] }[] = [
  { value: 'none', label: 'None' },
  { value: 'checkpoint', label: 'Checkpoint', params: ['checkpoint'] },
  { value: 'vae', label: 'VAE', params: ['vae'] },
  { value: 'text_encoder', label: 'Text encoder', params: ['textEncoder'] },
  { value: 'lora', label: 'LoRA', params: ['loras'] },
  { value: 'sampler', label: 'Sampler', params: ['sampler'] },
  { value: 'scheduler', label: 'Scheduler', params: ['scheduler'] },
  { value: 'resolution', label: 'Resolution', params: ['width', 'height'] },
  { value: 'steps', label: 'Steps', params: ['steps'] },
  { value: 'cfg', label: 'CFG', params: ['cfg'] },
  { value: 'seed', label: 'Seed', params: ['seed'] },
  { value: 'prompt_sr', label: 'Prompt S/R', params: ['prompt', 'negativePrompt'] },
]

export function xyAxisValues(axis: XyAxisSettings | null | undefined): string[] {
  if (!axis || axis.type === 'none') {
    return []
  }
  return axis.values.map((item) => item.trim()).filter(Boolean)
}

export function xyCellCount(settings: XyPlotSettings | null | undefined): number {
  if (!settings) {
    return 0
  }
  const x = xyAxisValues(settings.x)
  const y = xyAxisValues(settings.y)
  if (!x.length && !y.length) {
    return 0
  }
  return Math.max(1, x.length) * Math.max(1, y.length)
}

export function xyTypeOptions(params: string[], otherType: string): SelectOption[] {
  return TYPE_DEFS.filter((item) => {
    if (item.value !== 'none' && item.value === otherType && !XY_SHARED_TYPES.has(item.value)) {
      return false
    }
    if (!item.params) {
      return true
    }
    if (!params.length) {
      return !item.params.some((key) => key === 'vae' || key === 'textEncoder')
    }
    return item.params.some((key) => params.includes(key))
  }).map((item) => ({
    value: item.value,
    label: item.label,
  }))
}

export function xyTypeAllowsCustom(type: XyAxisType) {
  return type === 'resolution' || type === 'steps' || type === 'cfg' || type === 'seed' || type === 'prompt_sr'
}

export function xyTypeUsesOptions(type: XyAxisType) {
  return (
    type === 'checkpoint' ||
    type === 'vae' ||
    type === 'text_encoder' ||
    type === 'lora' ||
    type === 'sampler' ||
    type === 'scheduler' ||
    type === 'resolution'
  )
}
