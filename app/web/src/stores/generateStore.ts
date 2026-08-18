import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const DEFAULTS = {
  prompt: '1girl, black hair',
  negativePrompt: '',
  checkpoint: 'waiIllustriousSDXL_v140.safetensors',
  width: 832,
  height: 1216,
  steps: 20,
  cfg: 4,
  seed: -1,
  batchSize: 1,
  batchCount: 1,
  sampler: 'euler',
  scheduler: 'sgm_uniform',
  resMode: 'raw' as const,
  aspect: '2:3',
  megapixels: 1,
  workflow: 'txt2img',
}

export const PARAM_KEYS = [
  'prompt',
  'negativePrompt',
  'checkpoint',
  'width',
  'height',
  'steps',
  'cfg',
  'seed',
  'batchSize',
  'batchCount',
  'sampler',
  'scheduler',
  'resMode',
  'aspect',
  'megapixels',
] as const

export type TemplateParams = {
  prompt: string
  negativePrompt: string
  checkpoint: string
  width: number
  height: number
  steps: number
  cfg: number
  seed: number
  batchSize: number
  batchCount: number
  sampler: string
  scheduler: string
  resMode: 'raw' | 'scaler'
  aspect: string
  megapixels: number
}

export function pickParams(source: TemplateParams): TemplateParams {
  return {
    prompt: source.prompt,
    negativePrompt: source.negativePrompt,
    checkpoint: source.checkpoint,
    width: source.width,
    height: source.height,
    steps: source.steps,
    cfg: source.cfg,
    seed: source.seed,
    batchSize: source.batchSize,
    batchCount: source.batchCount,
    sampler: source.sampler,
    scheduler: source.scheduler,
    resMode: source.resMode,
    aspect: source.aspect,
    megapixels: source.megapixels,
  }
}

export const DEFAULT_PARAMS = pickParams(DEFAULTS)

export function mergeParams(raw: Partial<TemplateParams> | Record<string, unknown> | undefined): TemplateParams {
  const next = pickParams(DEFAULT_PARAMS)
  if (!raw) {
    return next
  }
  for (const key of PARAM_KEYS) {
    const value = raw[key]
    if (value !== undefined && value !== null) {
      if (key === 'resMode' && value !== 'raw' && value !== 'scaler') {
        continue
      }
      ;(next as Record<string, unknown>)[key] = value
    }
  }
  return next
}

export function paramsEqual(a: TemplateParams, b: TemplateParams): boolean {
  return PARAM_KEYS.every((key) => a[key] === b[key])
}

export function paramsOf(item: { builtin?: boolean; params?: Record<string, unknown> }): TemplateParams {
  return item.builtin ? DEFAULT_PARAMS : mergeParams(item.params)
}

export const APPLY_FIELDS = [
  { id: 'prompt', label: 'Prompt', keys: ['prompt'] },
  { id: 'negativePrompt', label: 'Negative', keys: ['negativePrompt'] },
  { id: 'checkpoint', label: 'Checkpoint', keys: ['checkpoint'] },
  { id: 'sampler', label: 'Sampler', keys: ['sampler'] },
  { id: 'scheduler', label: 'Scheduler', keys: ['scheduler'] },
  { id: 'steps', label: 'Steps', keys: ['steps'] },
  { id: 'cfg', label: 'CFG', keys: ['cfg'] },
  { id: 'seed', label: 'Seed', keys: ['seed'] },
  { id: 'resolution', label: 'Resolution', keys: ['width', 'height', 'resMode', 'aspect', 'megapixels'] },
  { id: 'batchCount', label: 'Batch count', keys: ['batchCount'] },
  { id: 'batchSize', label: 'Batch size', keys: ['batchSize'] },
] as const

const APPLY_OFF = new Set(['prompt', 'resolution', 'batchCount', 'batchSize'])

export const DEFAULT_APPLY = APPLY_FIELDS.filter((field) => !APPLY_OFF.has(field.id)).map((field) => field.id)

export function applyOf(raw?: string[] | null): string[] {
  if (raw == null) {
    return [...DEFAULT_APPLY]
  }
  const known = new Set<string>(APPLY_FIELDS.map((field) => field.id))
  return raw.filter((id) => known.has(id))
}

export function applyEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false
  }
  const set = new Set(a)
  return b.every((id) => set.has(id))
}

export function mixParams(current: TemplateParams, incoming: TemplateParams, apply: string[]): TemplateParams {
  const next = pickParams(current)
  const enabled = new Set(apply)
  for (const field of APPLY_FIELDS) {
    if (!enabled.has(field.id)) {
      continue
    }
    for (const key of field.keys) {
      ;(next as Record<string, unknown>)[key] = incoming[key]
    }
  }
  next.cfg = Math.max(1, next.cfg)
  return next
}

export function paramsEqualApply(a: TemplateParams, b: TemplateParams, apply: string[]): boolean {
  const enabled = new Set(apply)
  for (const field of APPLY_FIELDS) {
    if (!enabled.has(field.id)) {
      continue
    }
    for (const key of field.keys) {
      if (a[key] !== b[key]) {
        return false
      }
    }
  }
  return true
}

type GenerateState = {
  prompt: string
  negativePrompt: string
  checkpoint: string
  width: number
  height: number
  steps: number
  cfg: number
  seed: number
  batchSize: number
  batchCount: number
  sampler: string
  scheduler: string
  resMode: 'raw' | 'scaler'
  aspect: string
  megapixels: number
  workflow: string
  templateId: string
  templateByWorkflow: Record<string, string>
  setPrompt: (value: string) => void
  setNegativePrompt: (value: string) => void
  setCheckpoint: (value: string) => void
  setWidth: (value: number) => void
  setHeight: (value: number) => void
  setSteps: (value: number) => void
  setCfg: (value: number) => void
  setSeed: (value: number) => void
  setBatchSize: (value: number) => void
  setBatchCount: (value: number) => void
  setSampler: (value: string) => void
  setScheduler: (value: string) => void
  setResMode: (value: 'raw' | 'scaler') => void
  setAspect: (value: string) => void
  setMegapixels: (value: number) => void
  setWorkflow: (value: string) => void
  setTemplateId: (value: string) => void
  applyParams: (params: TemplateParams) => void
}

export const useGenerateStore = create<GenerateState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      templateId: 'default',
      templateByWorkflow: {},
      setPrompt: (prompt) => set({ prompt }),
      setNegativePrompt: (negativePrompt) => set({ negativePrompt }),
      setCheckpoint: (checkpoint) => set({ checkpoint }),
      setWidth: (width) => set({ width }),
      setHeight: (height) => set({ height }),
      setSteps: (steps) => set({ steps }),
      setCfg: (cfg) => set({ cfg: Math.max(1, cfg) }),
      setSeed: (seed) => set({ seed }),
      setBatchSize: (batchSize) => set({ batchSize }),
      setBatchCount: (batchCount) => set({ batchCount }),
      setSampler: (sampler) => set({ sampler }),
      setScheduler: (scheduler) => set({ scheduler }),
      setResMode: (resMode) => set({ resMode }),
      setAspect: (aspect) => set({ aspect }),
      setMegapixels: (megapixels) => set({ megapixels }),
      setWorkflow: (workflow) =>
        set((s) => ({
          workflow,
          templateId: s.templateByWorkflow?.[workflow] ?? 'default',
        })),
      setTemplateId: (templateId) =>
        set((s) => ({
          templateId,
          templateByWorkflow: { ...s.templateByWorkflow, [s.workflow]: templateId },
        })),
      applyParams: (params) => set(pickParams({ ...params, cfg: Math.max(1, params.cfg) })),
    }),
    { name: 'blombo-generate' },
  ),
)
