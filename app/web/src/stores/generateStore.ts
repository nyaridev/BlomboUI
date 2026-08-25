import { parseModelTileStyle, type ModelTileStyle } from '@/screens/generate/modelLayouts.ts'
import { isResMode, type ResMode } from '@/screens/generate/resolutions.ts'
import {
  applyWorkflowModels,
  AUTO_LORA_PREFIX,
  emptyWorkflowModels,
  parseModelsByWorkflow,
  patchWorkflowModels,
  snapshotWorkflowModels,
  type WorkflowModels,
} from '@/stores/workflowModels.ts'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const SEED_AFTER = [
  { value: 'randomize', label: 'Randomize' },
  { value: 'fixed', label: 'Fixed' },
  { value: 'increment', label: 'Increment' },
  { value: 'decrement', label: 'Decrement' },
] as const

export type SeedAfter = (typeof SEED_AFTER)[number]['value']

export const DEFAULTS = {
  prompt: '1girl, black hair',
  negativePrompt: '',
  checkpoint: 'waiIllustriousSDXL_v140.safetensors',
  vae: '',
  textEncoder: '',
  width: 832,
  height: 1216,
  steps: 20,
  cfg: 4,
  seed: -1,
  seedAfter: 'randomize' as SeedAfter,
  outputImagePath: '',
  outputGridPath: '',
  outputImageName: '',
  outputGridName: '',
  outputPathEnabled: false,
  batchSize: 1,
  batchCount: 1,
  sampler: 'euler',
  scheduler: 'sgm_uniform',
  resMode: 'raw' as ResMode,
  aspect: '2:3',
  megapixels: 1,
  workflow: 'txt2img',
}

export const PARAM_KEYS = [
  'prompt',
  'negativePrompt',
  'checkpoint',
  'vae',
  'textEncoder',
  'width',
  'height',
  'steps',
  'cfg',
  'seed',
  'seedAfter',
  'outputImagePath',
  'outputGridPath',
  'outputImageName',
  'outputGridName',
  'outputPathEnabled',
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
  vae: string
  textEncoder: string
  width: number
  height: number
  steps: number
  cfg: number
  seed: number
  seedAfter: SeedAfter
  outputImagePath: string
  outputGridPath: string
  outputImageName: string
  outputGridName: string
  outputPathEnabled: boolean
  batchSize: number
  batchCount: number
  sampler: string
  scheduler: string
  resMode: ResMode
  aspect: string
  megapixels: number
}

export function pickParams(source: TemplateParams): TemplateParams {
  return {
    prompt: source.prompt,
    negativePrompt: source.negativePrompt,
    checkpoint: source.checkpoint,
    vae: source.vae,
    textEncoder: source.textEncoder,
    width: source.width,
    height: source.height,
    steps: source.steps,
    cfg: source.cfg,
    seed: source.seed,
    seedAfter: source.seedAfter,
    outputImagePath: source.outputImagePath,
    outputGridPath: source.outputGridPath,
    outputImageName: source.outputImageName,
    outputGridName: source.outputGridName,
    outputPathEnabled: source.outputPathEnabled,
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
      if (key === 'resMode' && !isResMode(value)) {
        continue
      }
      if (key === 'seedAfter' && !SEED_AFTER.some((item) => item.value === value)) {
        continue
      }
      if (key === 'outputPathEnabled' && typeof value !== 'boolean') {
        continue
      }
      ;(next as Record<string, unknown>)[key] = value
    }
  }
  if (!raw || raw.seedAfter == null) {
    next.seedAfter = next.seed < 0 ? 'randomize' : 'fixed'
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
  { id: 'vae', label: 'VAE', keys: ['vae'] },
  { id: 'textEncoder', label: 'Text encoder', keys: ['textEncoder'] },
  { id: 'sampler', label: 'Sampler', keys: ['sampler'] },
  { id: 'scheduler', label: 'Scheduler', keys: ['scheduler'] },
  { id: 'steps', label: 'Steps', keys: ['steps'] },
  { id: 'cfg', label: 'CFG', keys: ['cfg'] },
  { id: 'seed', label: 'Seed', keys: ['seed', 'seedAfter'] },
  { id: 'outputPath', label: 'Output path', keys: ['outputImagePath', 'outputGridPath', 'outputImageName', 'outputGridName', 'outputPathEnabled'] },
  { id: 'resolution', label: 'Resolution', keys: ['width', 'height', 'resMode', 'aspect', 'megapixels'] },
  { id: 'batchCount', label: 'Batch count', keys: ['batchCount'] },
  { id: 'batchSize', label: 'Batch size', keys: ['batchSize'] },
] as const

const APPLY_OFF = new Set(['prompt', 'resolution', 'batchCount', 'batchSize'])

export const DEFAULT_APPLY = APPLY_FIELDS.filter((field) => !APPLY_OFF.has(field.id)).map((field) => field.id)

export function randomSeed() {
  return Math.floor(Math.random() * (2 ** 53))
}

export function usedSeed(seed: number, mode: SeedAfter) {
  if (mode === 'randomize' || seed < 0) {
    return randomSeed()
  }
  return seed
}

export function nextSeed(used: number, mode: SeedAfter, steps = 1) {
  if (mode === 'randomize') {
    return -1
  }
  if (mode === 'increment') {
    return used + steps
  }
  if (mode === 'decrement') {
    return used - steps
  }
  return used
}

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

export type ModelSwap =
  | { slot: 'checkpoint' }
  | { slot: 'textEncoder' }
  | { slot: 'vae' }
  | { slot: 'lora'; index: number; path?: string; auto?: boolean }
  | { slot: 'wildcard'; index: number }

export function sameModelSwap(a: ModelSwap | null, b: ModelSwap | null) {
  if (!a || !b || a.slot !== b.slot) {
    return false
  }
  if (a.slot !== b.slot) {
    return false
  }
  if (a.slot === 'lora' && b.slot === 'lora') {
    return a.index === b.index && a.path === b.path && a.auto === b.auto
  }
  if (a.slot === 'wildcard' && b.slot === 'wildcard') {
    return a.index === b.index
  }
  return true
}

export function autoLoraId(path: string) {
  return `${AUTO_LORA_PREFIX}${path}`
}

export function promptLoraId(path: string, index: number) {
  return `prompt:${path}:${index}`
}

function cleanActiveLoraOrder(raw: unknown): string[] {
  return Array.isArray(raw)
    ? [...new Set(raw.filter((item): item is string => typeof item === 'string' && Boolean(item)))]
    : []
}

function cleanActiveLoraStrengths(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(raw).filter(
      ([path, value]) => Boolean(path) && typeof value === 'number' && Number.isFinite(value),
    ),
  )
}

export function reorderActiveLoras(order: string[], draggedId: string, targetId: string, before = true): string[] | null {
  const from = order.indexOf(draggedId)
  const target = order.indexOf(targetId)
  if (from < 0 || target < 0 || from === target) {
    return null
  }
  const next = [...order]
  const [moved] = next.splice(from, 1)
  const insertAt = next.indexOf(targetId) + (before ? 0 : 1)
  if (insertAt === from) {
    return null
  }
  next.splice(insertAt, 0, moved)
  return next
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
  resMode: ResMode
  aspect: string
  megapixels: number
  workflow: string
  templateId: string
  templateByWorkflow: Record<string, string>
  modelsByWorkflow: Record<string, WorkflowModels>
  seedAfter: SeedAfter
  outputImagePath: string
  outputGridPath: string
  outputImageName: string
  outputGridName: string
  outputPathEnabled: boolean
  modelTileStyle: ModelTileStyle
  vae: string
  textEncoder: string
  swapTarget: ModelSwap | null
  activeLoraOrder: string[]
  activeLoraStrengths: Record<string, number>
  setPrompt: (value: string) => void
  setNegativePrompt: (value: string) => void
  setCheckpoint: (value: string) => void
  setWidth: (value: number) => void
  setHeight: (value: number) => void
  setSteps: (value: number) => void
  setCfg: (value: number) => void
  setSeed: (value: number) => void
  setSeedAfter: (value: SeedAfter, lastSeed?: number | null) => void
  setOutputImagePath: (value: string) => void
  setOutputGridPath: (value: string) => void
  setOutputImageName: (value: string) => void
  setOutputGridName: (value: string) => void
  setOutputPathEnabled: (value: boolean) => void
  setModelTileStyle: (value: ModelTileStyle) => void
  setVae: (value: string) => void
  setTextEncoder: (value: string) => void
  setSwapTarget: (value: ModelSwap | null) => void
  setActiveLoraOrder: (value: string[]) => void
  setActiveLoraStrength: (path: string, value: number) => void
  toggleAutoLora: (path: string) => void
  setBatchSize: (value: number) => void
  setBatchCount: (value: number) => void
  setSampler: (value: string) => void
  setScheduler: (value: string) => void
  setResMode: (value: ResMode) => void
  setAspect: (value: string) => void
  setMegapixels: (value: number) => void
  setWorkflow: (value: string) => void
  setTemplateId: (value: string) => void
  applyParams: (params: TemplateParams) => void
  viewedImageUrl: string | null
  setViewedImageUrl: (value: string | null) => void
}

export const useGenerateStore = create<GenerateState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      templateId: 'default',
      templateByWorkflow: {},
      modelsByWorkflow: {},
      viewedImageUrl: null,
      modelTileStyle: 'tall',
      vae: '',
      textEncoder: '',
      swapTarget: null,
      activeLoraOrder: [],
      activeLoraStrengths: {},
      setPrompt: (prompt) => set({ prompt }),
      setNegativePrompt: (negativePrompt) => set({ negativePrompt }),
      setCheckpoint: (checkpoint) => set((s) => patchWorkflowModels(s, { checkpoint })),
      setWidth: (width) => set({ width }),
      setHeight: (height) => set({ height }),
      setSteps: (steps) => set({ steps }),
      setCfg: (cfg) => set({ cfg: Math.max(1, cfg) }),
      setSeed: (seed) => set({ seed }),
      setSeedAfter: (seedAfter, lastSeed) =>
        set((s) => {
          if (seedAfter === 'randomize') {
            return { seedAfter, seed: -1 }
          }
          if (s.seedAfter === 'randomize' && lastSeed != null) {
            return { seedAfter, seed: lastSeed }
          }
          return { seedAfter }
        }),
      setOutputImagePath: (outputImagePath) => set({ outputImagePath }),
      setOutputGridPath: (outputGridPath) => set({ outputGridPath }),
      setOutputImageName: (outputImageName) => set({ outputImageName }),
      setOutputGridName: (outputGridName) => set({ outputGridName }),
      setOutputPathEnabled: (outputPathEnabled) => set({ outputPathEnabled }),
      setModelTileStyle: (modelTileStyle) => set({ modelTileStyle: parseModelTileStyle(modelTileStyle) }),
      setVae: (vae) => set((s) => patchWorkflowModels(s, { vae })),
      setTextEncoder: (textEncoder) => set((s) => patchWorkflowModels(s, { textEncoder })),
      setSwapTarget: (swapTarget) => set({ swapTarget }),
      setActiveLoraOrder: (activeLoraOrder) =>
        set((s) => patchWorkflowModels(s, { activeLoraOrder: cleanActiveLoraOrder(activeLoraOrder) })),
      setActiveLoraStrength: (path, value) =>
        set((state) => {
          if (!path || !Number.isFinite(value)) {
            return state
          }
          return patchWorkflowModels(state, {
            activeLoraStrengths: { ...state.activeLoraStrengths, [path]: value },
          })
        }),
      toggleAutoLora: (path) =>
        set((state) => {
          const id = autoLoraId(path)
          const order = state.activeLoraOrder
          const activeLoraOrder = order.includes(id)
            ? order.filter((item) => item !== id)
            : [...order, id]
          return patchWorkflowModels(state, { activeLoraOrder })
        }),
      setBatchSize: (batchSize) => set({ batchSize }),
      setBatchCount: (batchCount) => set({ batchCount }),
      setSampler: (sampler) => set({ sampler }),
      setScheduler: (scheduler) => set({ scheduler }),
      setResMode: (resMode) => set({ resMode }),
      setAspect: (aspect) => set({ aspect }),
      setMegapixels: (megapixels) => set({ megapixels }),
      setWorkflow: (workflow) =>
        set((s) => {
          if (workflow === s.workflow) {
            return s
          }
          const modelsByWorkflow = {
            ...s.modelsByWorkflow,
            [s.workflow]: snapshotWorkflowModels(s),
          }
          const incoming = modelsByWorkflow[workflow] ?? emptyWorkflowModels(DEFAULTS.checkpoint)
          return {
            ...applyWorkflowModels(incoming, s.activeLoraOrder, s.activeLoraStrengths),
            workflow,
            templateId: s.templateByWorkflow?.[workflow] ?? 'default',
            modelsByWorkflow,
            swapTarget: null,
          }
        }),
      setTemplateId: (templateId) =>
        set((s) => ({
          templateId,
          templateByWorkflow: { ...s.templateByWorkflow, [s.workflow]: templateId },
        })),
      applyParams: (params) =>
        set((s) => {
          const next = pickParams({ ...params, cfg: Math.max(1, params.cfg) })
          return {
            ...next,
            ...patchWorkflowModels(s, {
              checkpoint: next.checkpoint,
              vae: next.vae,
              textEncoder: next.textEncoder,
            }),
          }
        }),
      setViewedImageUrl: (viewedImageUrl) => set({ viewedImageUrl }),
    }),
    {
      name: 'blombo-generate',
      partialize: ({ viewedImageUrl: _viewed, swapTarget: _swap, ...rest }) => rest,
      merge: (persisted, current) => {
        const rest = persisted && typeof persisted === 'object' ? (persisted as Record<string, unknown>) : {}
        const activeLoraOrder = cleanActiveLoraOrder(rest.activeLoraOrder)
        const activeLoraStrengths = cleanActiveLoraStrengths(rest.activeLoraStrengths)
        const checkpoint = typeof rest.checkpoint === 'string' ? rest.checkpoint : current.checkpoint
        const vae = typeof rest.vae === 'string' ? rest.vae : current.vae
        const textEncoder = typeof rest.textEncoder === 'string' ? rest.textEncoder : current.textEncoder
        const workflow = typeof rest.workflow === 'string' && rest.workflow ? rest.workflow : current.workflow
        const modelsByWorkflow = {
          ...parseModelsByWorkflow(rest.modelsByWorkflow, DEFAULTS.checkpoint),
          [workflow]: snapshotWorkflowModels({
            checkpoint,
            vae,
            textEncoder,
            activeLoraOrder,
            activeLoraStrengths,
          }),
        }
        return {
          ...current,
          ...rest,
          modelTileStyle: parseModelTileStyle(rest.modelTileStyle),
          outputPathEnabled: typeof rest.outputPathEnabled === 'boolean' ? rest.outputPathEnabled : current.outputPathEnabled,
          activeLoraOrder,
          activeLoraStrengths,
          modelsByWorkflow,
        }
      },
    },
  ),
)
