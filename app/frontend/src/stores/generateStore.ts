import { parseModelTileStyle, type ModelTileStyle } from '@/views/generate/panels/chrome/sections/tiles/modelLayouts.ts'
import { readyTemplateParams } from '@/components/composites/templates/templateApply.ts'
import {
  DEFAULT_PROMPT_MATRIX,
  isGenerateScript,
  isPromptMatrixMode,
  isPromptMatrixTarget,
  type GenerateScript,
  type PromptMatrixSettings,
} from '@/views/generate/panels/generation/sections/params/promptMatrix.ts'
import { DEFAULT_XY_PLOT, type XyPlotSettings } from '@/views/generate/panels/generation/sections/params/xyPlot.ts'
import { isHiresSizeMode, isResMode, snapDim, type HiresSizeMode, type ResMode } from '@/views/generate/panels/generation/sections/params/resolutions.ts'
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

function isSeedAfter(value: unknown): value is SeedAfter {
  return SEED_AFTER.some((item) => item.value === value)
}

export type ExtraSettings = { enabled: boolean; [key: string]: unknown }

export type HiresLora = { path: string; strength: number }

export type HiresSettings = {
  enabled: boolean
  scale: number
  sizeMode: HiresSizeMode
  width: number
  height: number
  aspect: string
  megapixels: number
  upscaleModel: string
  upscaleMethod: string
  crop: string
  steps: number
  cfg: number
  sampler: string
  scheduler: string
  denoise: number
  seed: number
  seedAfter: SeedAfter
  seedOverride: boolean
  promptOverride: boolean
  prompt: string
  negativeOverride: boolean
  negativePrompt: string
  modelOverride: boolean
  checkpoint: string
  vae: string
  textEncoder: string
  loraOverride: boolean
  loras: HiresLora[]
  saveBefore: boolean
  clearVram: boolean
}

const DEFAULT_EXTRA: ExtraSettings = { enabled: false }

export const DEFAULT_HIRES: HiresSettings = {
  enabled: false,
  scale: 1.5,
  sizeMode: 'scale',
  width: 1248,
  height: 1824,
  aspect: '2:3',
  megapixels: 1,
  upscaleModel: '',
  upscaleMethod: 'bilinear',
  crop: 'disabled',
  steps: 15,
  cfg: 4,
  sampler: 'euler',
  scheduler: 'sgm_uniform',
  denoise: 0.55,
  seed: -1,
  seedAfter: 'randomize',
  seedOverride: false,
  promptOverride: false,
  prompt: '',
  negativeOverride: false,
  negativePrompt: '',
  modelOverride: false,
  checkpoint: '',
  vae: '',
  textEncoder: '',
  loraOverride: false,
  loras: [],
  saveBefore: true,
  clearVram: false,
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function sameParam(a: unknown, b: unknown) {
  if (a === b) {
    return true
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a == null || b == null) {
    return false
  }
  return JSON.stringify(a) === JSON.stringify(b)
}

function mergeHires(raw: unknown, firstW = 832, firstH = 1216): HiresSettings {
  const base = cloneJson(DEFAULT_HIRES)
  const scaleFallback = Math.max(1, Math.min(8, base.scale))
  const seededW = snapDim(firstW * scaleFallback)
  const seededH = snapDim(firstH * scaleFallback)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...base, width: seededW, height: seededH }
  }
  const row = raw as Record<string, unknown>
  const num = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback
  const scale = Math.max(1, Math.min(8, num(row.scale, base.scale)))
  const dim = (value: unknown, fallback: number) => {
    const n = num(value, fallback)
    return n >= 64 ? snapDim(n) : fallback
  }
  const sizeModeRaw = row.sizeMode ?? row.size_mode
  const seedAfterRaw = row.seedAfter ?? row.seed_after
  const follow = typeof row.seedFollow === 'boolean' ? row.seedFollow : typeof row.seed_follow === 'boolean' ? row.seed_follow : null
  const seedOverrideRaw = row.seedOverride ?? row.seed_override
  const lorasRaw = row.loras
  const loras: HiresLora[] = Array.isArray(lorasRaw)
    ? lorasRaw.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return []
        }
        const path = typeof (item as { path?: unknown }).path === 'string' ? (item as { path: string }).path.trim() : ''
        if (!path) {
          return []
        }
        const strength = (item as { strength?: unknown }).strength
        return [{ path, strength: typeof strength === 'number' && Number.isFinite(strength) ? strength : 1 }]
      })
    : []
  return {
    enabled: Boolean(row.enabled),
    scale,
    sizeMode: isHiresSizeMode(sizeModeRaw) ? sizeModeRaw : 'scale',
    width: dim(row.width, snapDim(firstW * scale)),
    height: dim(row.height, snapDim(firstH * scale)),
    aspect: typeof row.aspect === 'string' && row.aspect ? row.aspect : base.aspect,
    megapixels: Math.max(0.2, Math.min(4, num(row.megapixels, base.megapixels))),
    upscaleModel: typeof row.upscaleModel === 'string' ? row.upscaleModel : typeof row.upscale_model === 'string' ? row.upscale_model : base.upscaleModel,
    upscaleMethod:
      typeof (row.upscaleMethod ?? row.upscale_method) === 'string' && (row.upscaleMethod ?? row.upscale_method)
        ? String(row.upscaleMethod ?? row.upscale_method)
        : base.upscaleMethod,
    crop: typeof row.crop === 'string' && row.crop ? row.crop : base.crop,
    steps: Math.max(1, Math.min(150, Math.round(num(row.steps, base.steps)))),
    cfg: Math.max(1, Math.min(30, num(row.cfg, base.cfg))),
    sampler: typeof row.sampler === 'string' && row.sampler ? row.sampler : base.sampler,
    scheduler: typeof row.scheduler === 'string' && row.scheduler ? row.scheduler : base.scheduler,
    denoise: Math.max(0, Math.min(1, num(row.denoise, base.denoise))),
    seed: Number.isFinite(num(row.seed, base.seed)) ? Math.round(num(row.seed, base.seed)) : base.seed,
    seedAfter: isSeedAfter(seedAfterRaw) ? seedAfterRaw : base.seedAfter,
    seedOverride: typeof seedOverrideRaw === 'boolean' ? seedOverrideRaw : follow == null ? base.seedOverride : !follow,
    promptOverride: Boolean(row.promptOverride ?? row.prompt_override),
    prompt: typeof row.prompt === 'string' ? row.prompt : base.prompt,
    negativeOverride: Boolean(row.negativeOverride ?? row.negative_override),
    negativePrompt: typeof row.negativePrompt === 'string' ? row.negativePrompt : typeof row.negative_prompt === 'string' ? row.negative_prompt : base.negativePrompt,
    modelOverride: Boolean(row.modelOverride ?? row.model_override),
    checkpoint: typeof row.checkpoint === 'string' ? row.checkpoint : base.checkpoint,
    vae: typeof row.vae === 'string' ? row.vae : base.vae,
    textEncoder: typeof row.textEncoder === 'string' ? row.textEncoder : typeof row.text_encoder === 'string' ? row.text_encoder : base.textEncoder,
    loraOverride: Boolean(row.loraOverride ?? row.lora_override),
    loras,
    saveBefore: typeof row.saveBefore === 'boolean' ? row.saveBefore : typeof row.save_before === 'boolean' ? row.save_before : base.saveBefore,
    clearVram: typeof row.clearVram === 'boolean' ? row.clearVram : typeof row.clear_vram === 'boolean' ? row.clear_vram : base.clearVram,
  }
}

function mergeExtra(raw: unknown, fallback: ExtraSettings): ExtraSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return cloneJson(fallback)
  }
  return { ...(raw as ExtraSettings), enabled: Boolean((raw as ExtraSettings).enabled) }
}

function mergePromptMatrix(raw: unknown): PromptMatrixSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return cloneJson(DEFAULT_PROMPT_MATRIX)
  }
  const row = raw as Record<string, unknown>
  return {
    lines: typeof row.lines === 'string' ? row.lines : DEFAULT_PROMPT_MATRIX.lines,
    saveGrid: typeof row.saveGrid === 'boolean' ? row.saveGrid : DEFAULT_PROMPT_MATRIX.saveGrid,
    useBatch: typeof row.useBatch === 'boolean' ? row.useBatch : DEFAULT_PROMPT_MATRIX.useBatch,
    mode: isPromptMatrixMode(row.mode) ? row.mode : DEFAULT_PROMPT_MATRIX.mode,
    target: isPromptMatrixTarget(row.target) ? row.target : DEFAULT_PROMPT_MATRIX.target,
    search: typeof row.search === 'string' ? row.search : DEFAULT_PROMPT_MATRIX.search,
  }
}

function mergeXyPlot(raw: unknown): XyPlotSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return cloneJson(DEFAULT_XY_PLOT)
  }
  const row = raw as Record<string, unknown>
  const axis = (value: unknown): XyPlotSettings['x'] => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { type: 'none', values: [] }
    }
    const item = value as Record<string, unknown>
    const type = typeof item.type === 'string' ? item.type : 'none'
    const values = Array.isArray(item.values) ? item.values.filter((entry): entry is string => typeof entry === 'string') : []
    return { type: type as XyPlotSettings['x']['type'], values }
  }
  return {
    x: axis(row.x),
    y: axis(row.y),
    drawLegend: typeof row.drawLegend === 'boolean' ? row.drawLegend : DEFAULT_XY_PLOT.drawLegend,
    drawType: typeof row.drawType === 'boolean' ? row.drawType : DEFAULT_XY_PLOT.drawType,
    keepMinusOne: typeof row.keepMinusOne === 'boolean' ? row.keepMinusOne : DEFAULT_XY_PLOT.keepMinusOne,
    includeSubImages: typeof row.includeSubImages === 'boolean' ? row.includeSubImages : DEFAULT_XY_PLOT.includeSubImages,
    respectInstantLora: typeof row.respectInstantLora === 'boolean' ? row.respectInstantLora : DEFAULT_XY_PLOT.respectInstantLora,
    gridMargin: typeof row.gridMargin === 'number' && Number.isFinite(row.gridMargin) ? row.gridMargin : DEFAULT_XY_PLOT.gridMargin,
  }
}

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
  outputHiresPath: '',
  outputHiresName: '',
  outputPathEnabled: false,
  batchSize: 1,
  batchCount: 1,
  sampler: 'euler',
  scheduler: 'sgm_uniform',
  resMode: 'raw' as ResMode,
  aspect: '2:3',
  megapixels: 1,
  workflow: 'txt2img',
  hires: cloneJson(DEFAULT_HIRES),
  adetailer: { ...DEFAULT_EXTRA } as ExtraSettings,
  controlnet: { ...DEFAULT_EXTRA } as ExtraSettings,
  script: '' as GenerateScript,
  promptMatrix: cloneJson(DEFAULT_PROMPT_MATRIX),
  xyPlot: cloneJson(DEFAULT_XY_PLOT),
  activeLoraOrder: [] as string[],
  activeLoraStrengths: {} as Record<string, number>,
  skippedLoras: [] as string[],
  skippedWildcards: [] as string[],
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
  'outputHiresPath',
  'outputHiresName',
  'outputPathEnabled',
  'batchSize',
  'batchCount',
  'sampler',
  'scheduler',
  'resMode',
  'aspect',
  'megapixels',
  'hires',
  'adetailer',
  'controlnet',
  'script',
  'promptMatrix',
  'xyPlot',
  'activeLoraOrder',
  'activeLoraStrengths',
  'skippedLoras',
  'skippedWildcards',
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
  outputHiresPath: string
  outputHiresName: string
  outputPathEnabled: boolean
  batchSize: number
  batchCount: number
  sampler: string
  scheduler: string
  resMode: ResMode
  aspect: string
  megapixels: number
  hires: HiresSettings
  adetailer: ExtraSettings
  controlnet: ExtraSettings
  script: GenerateScript
  promptMatrix: PromptMatrixSettings
  xyPlot: XyPlotSettings
  activeLoraOrder: string[]
  activeLoraStrengths: Record<string, number>
  skippedLoras: string[]
  skippedWildcards: string[]
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
    outputGridName: source.outputGridName ?? '',
    outputHiresPath: source.outputHiresPath ?? '',
    outputHiresName: source.outputHiresName ?? '',
    outputPathEnabled: source.outputPathEnabled,
    batchSize: source.batchSize,
    batchCount: source.batchCount,
    sampler: source.sampler,
    scheduler: source.scheduler,
    resMode: source.resMode,
    aspect: source.aspect,
    megapixels: source.megapixels,
    hires: mergeHires(source.hires, source.width, source.height),
    adetailer: cloneJson(source.adetailer),
    controlnet: cloneJson(source.controlnet),
    script: source.script,
    promptMatrix: cloneJson(source.promptMatrix),
    xyPlot: cloneJson(source.xyPlot),
    activeLoraOrder: [...(source.activeLoraOrder ?? [])],
    activeLoraStrengths: { ...(source.activeLoraStrengths ?? {}) },
    skippedLoras: [...(source.skippedLoras ?? [])],
    skippedWildcards: [...(source.skippedWildcards ?? [])],
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
      if (key === 'script') {
        if (!isGenerateScript(value)) {
          continue
        }
        next.script = value
        continue
      }
      if (key === 'hires') {
        next.hires = mergeHires(value, next.width, next.height)
        continue
      }
      if (key === 'adetailer' || key === 'controlnet') {
        next[key] = mergeExtra(value, DEFAULT_EXTRA)
        continue
      }
      if (key === 'promptMatrix') {
        next.promptMatrix = mergePromptMatrix(value)
        continue
      }
      if (key === 'xyPlot') {
        next.xyPlot = mergeXyPlot(value)
        continue
      }
      if (key === 'activeLoraOrder' || key === 'skippedLoras' || key === 'skippedWildcards') {
        next[key] = Array.isArray(value)
          ? [...new Set(value.filter((item): item is string => typeof item === 'string' && Boolean(item)))]
          : []
        continue
      }
      if (key === 'activeLoraStrengths') {
        next.activeLoraStrengths =
          value && typeof value === 'object' && !Array.isArray(value)
            ? Object.fromEntries(
                Object.entries(value as Record<string, unknown>).filter(
                  (entry): entry is [string, number] => Boolean(entry[0]) && typeof entry[1] === 'number' && Number.isFinite(entry[1]),
                ),
              )
            : {}
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

function parseParamsByWorkflow(raw: unknown): Record<string, TemplateParams> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const out: Record<string, TemplateParams> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const name = key.trim()
    if (!name) {
      continue
    }
    out[name] = mergeParams(value as Record<string, unknown>)
  }
  return out
}

export function paramsEqual(a: TemplateParams, b: TemplateParams): boolean {
  return PARAM_KEYS.every((key) => sameParam(a[key], b[key]))
}

export function paramsOf(item: { builtin?: boolean; params?: Record<string, unknown> }): TemplateParams {
  if (item.builtin) {
    return pickParams({
      ...DEFAULT_PARAMS,
      prompt: '',
      negativePrompt: '',
      checkpoint: '',
      vae: '',
      textEncoder: '',
      activeLoraOrder: [],
      activeLoraStrengths: {},
      skippedLoras: [],
      skippedWildcards: [],
    })
  }
  return mergeParams(item.params)
}

export const APPLY_FIELDS = [
  { id: 'prompt', label: 'Prompt', keys: ['prompt'] },
  { id: 'negativePrompt', label: 'Negative', keys: ['negativePrompt'] },
  { id: 'checkpoint', label: 'Checkpoint', keys: ['checkpoint'] },
  { id: 'vae', label: 'VAE', keys: ['vae'] },
  { id: 'textEncoder', label: 'Text encoder', keys: ['textEncoder'] },
  { id: 'loras', label: 'LoRAs', keys: ['activeLoraOrder', 'activeLoraStrengths'] },
  { id: 'sampler', label: 'Sampler', keys: ['sampler'] },
  { id: 'scheduler', label: 'Scheduler', keys: ['scheduler'] },
  { id: 'steps', label: 'Steps', keys: ['steps'] },
  { id: 'cfg', label: 'CFG', keys: ['cfg'] },
  { id: 'seed', label: 'Seed', keys: ['seed', 'seedAfter'] },
  { id: 'outputPath', label: 'Output path', keys: ['outputImagePath', 'outputGridPath', 'outputImageName', 'outputGridName', 'outputHiresPath', 'outputHiresName', 'outputPathEnabled'] },
  { id: 'resolution', label: 'Resolution', keys: ['width', 'height', 'resMode', 'aspect', 'megapixels'] },
  { id: 'batchCount', label: 'Batch count', keys: ['batchCount'] },
  { id: 'batchSize', label: 'Batch size', keys: ['batchSize'] },
  { id: 'hires', label: 'Hires. fix', keys: ['hires'] },
  { id: 'adetailer', label: 'ADetailer', keys: ['adetailer'] },
  { id: 'controlnet', label: 'ControlNet', keys: ['controlnet'] },
  { id: 'scripts', label: 'Scripts', keys: ['script', 'promptMatrix', 'xyPlot'] },
] as const

const CONTENT_APPLY = new Set(['prompt', 'negativePrompt', 'checkpoint', 'vae', 'textEncoder', 'loras'])

export const DEFAULT_APPLY = APPLY_FIELDS.map((field) => field.id).filter((id) => !CONTENT_APPLY.has(id))

export function templateApplyFields(_workflowParams: string[]) {
  return APPLY_FIELDS.filter((field) => {
    if (field.id === 'checkpoint' || field.id === 'vae' || field.id === 'textEncoder' || field.id === 'loras') {
      return false
    }
    return true
  })
}

export type ApplyLayer = { params: TemplateParams; apply: string[] }

export type TemplateLayer = {
  builtin?: boolean
  enabled?: boolean
  apply?: string[]
  params?: Record<string, unknown>
}

export function mixStack(current: TemplateParams, layers: ApplyLayer[]): TemplateParams {
  let next = pickParams(current)
  for (const layer of layers) {
    next = mixParams(next, layer.params, layer.apply)
  }
  return next
}

export function stackLayers(items: TemplateLayer[]): ApplyLayer[] {
  const layers: ApplyLayer[] = []
  for (const item of items) {
    if (item.builtin) {
      layers.push({ params: paramsOf(item), apply: applyOf(item.apply) })
      continue
    }
    if (item.enabled === false) {
      continue
    }
    layers.push({ params: paramsOf(item), apply: applyOf(item.apply) })
  }
  return layers
}

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
  const source = readyTemplateParams(incoming)
  const enabled = new Set(apply)
  for (const field of APPLY_FIELDS) {
    if (!enabled.has(field.id)) {
      continue
    }
    if (field.id === 'loras' && !source.activeLoraOrder.some((id) => id.startsWith(AUTO_LORA_PREFIX))) {
      continue
    }
    for (const key of field.keys) {
      const value = source[key]
      ;(next as Record<string, unknown>)[key] = typeof value === 'object' && value != null ? cloneJson(value) : value
    }
  }
  next.cfg = Math.max(1, next.cfg)
  return next
}

export type ParamDiff = { id: string; label: string; from: string; to: string }

function formatParamValue(value: unknown) {
  if (typeof value === 'boolean') {
    return value ? 'on' : 'off'
  }
  if (value && typeof value === 'object' && 'enabled' in value) {
    return (value as ExtraSettings).enabled ? 'on' : 'off'
  }
  if (value === 'xy-plot') {
    return 'X/Y Plot'
  }
  if (value === 'prompt-matrix') {
    return 'Prompt Matrix'
  }
  if (value === '') {
    return 'None'
  }
  const text = String(value ?? '')
  return text.length > 80 ? `${text.slice(0, 77)}…` : text || '—'
}

export function diffParams(from: TemplateParams, to: TemplateParams): ParamDiff[] {
  const diffs: ParamDiff[] = []
  for (const field of APPLY_FIELDS) {
    if (field.keys.every((key) => sameParam(from[key], to[key]))) {
      continue
    }
    diffs.push({
      id: field.id,
      label: field.label,
      from: field.id === 'scripts' ? formatParamValue(from.script) : field.keys.map((key) => formatParamValue(from[key])).join(', '),
      to: field.id === 'scripts' ? formatParamValue(to.script) : field.keys.map((key) => formatParamValue(to[key])).join(', '),
    })
  }
  return diffs
}

export function paramsEqualApply(a: TemplateParams, b: TemplateParams, apply: string[]): boolean {
  const enabled = new Set(apply)
  for (const field of APPLY_FIELDS) {
    if (!enabled.has(field.id)) {
      continue
    }
    for (const key of field.keys) {
      if (!sameParam(a[key], b[key])) {
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
  hires: HiresSettings
  adetailer: ExtraSettings
  controlnet: ExtraSettings
  script: GenerateScript
  promptMatrix: PromptMatrixSettings
  xyPlot: XyPlotSettings
  workflow: string
  templateId: string
  templateByWorkflow: Record<string, string>
  viewedTemplateByWorkflow: Record<string, string>
  paramsByWorkflow: Record<string, TemplateParams>
  modelsByWorkflow: Record<string, WorkflowModels>
  seedAfter: SeedAfter
  outputImagePath: string
  outputGridPath: string
  outputImageName: string
  outputGridName: string
  outputHiresPath: string
  outputHiresName: string
  outputPathEnabled: boolean
  modelTileStyle: ModelTileStyle
  vae: string
  textEncoder: string
  swapTarget: ModelSwap | null
  activeLoraOrder: string[]
  activeLoraStrengths: Record<string, number>
  skippedLoras: string[]
  skippedWildcards: string[]
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
  setOutputHiresPath: (value: string) => void
  setOutputHiresName: (value: string) => void
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
  setHires: (value: Partial<HiresSettings>) => void
  setAdetailer: (value: Partial<ExtraSettings>) => void
  setControlnet: (value: Partial<ExtraSettings>) => void
  setScript: (value: GenerateScript) => void
  setPromptMatrix: (value: PromptMatrixSettings) => void
  setXyPlot: (value: XyPlotSettings) => void
  setWorkflow: (value: string) => void
  setTemplateId: (value: string) => void
  setViewedTemplateId: (value: string) => void
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
      viewedTemplateByWorkflow: {},
      paramsByWorkflow: {},
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
      setOutputHiresPath: (outputHiresPath) => set({ outputHiresPath }),
      setOutputHiresName: (outputHiresName) => set({ outputHiresName }),
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
      setHires: (hires) => set((s) => ({ hires: { ...s.hires, ...hires } })),
      setAdetailer: (adetailer) => set((s) => ({ adetailer: { ...s.adetailer, ...adetailer } })),
      setControlnet: (controlnet) => set((s) => ({ controlnet: { ...s.controlnet, ...controlnet } })),
      setScript: (script) => set({ script: isGenerateScript(script) ? script : '' }),
      setPromptMatrix: (promptMatrix) => set({ promptMatrix: mergePromptMatrix(promptMatrix) }),
      setXyPlot: (xyPlot) => set({ xyPlot: mergeXyPlot(xyPlot) }),
      setWorkflow: (workflow) =>
        set((s) => {
          if (workflow === s.workflow) {
            return s
          }
          const paramsByWorkflow = {
            ...s.paramsByWorkflow,
            [s.workflow]: pickParams(s),
          }
          const modelsByWorkflow = {
            ...s.modelsByWorkflow,
            [s.workflow]: snapshotWorkflowModels(s),
          }
          const incomingModels = modelsByWorkflow[workflow] ?? emptyWorkflowModels(DEFAULTS.checkpoint)
          const incomingParams = paramsByWorkflow[workflow] ?? DEFAULT_PARAMS
          return {
            ...incomingParams,
            ...applyWorkflowModels(incomingModels),
            workflow,
            templateId: s.templateByWorkflow?.[workflow] ?? 'default',
            paramsByWorkflow,
            modelsByWorkflow,
            swapTarget: null,
          }
        }),
      setTemplateId: (templateId) =>
        set((s) => ({
          templateId,
          templateByWorkflow: { ...s.templateByWorkflow, [s.workflow]: templateId },
        })),
      setViewedTemplateId: (id) =>
        set((s) => ({
          viewedTemplateByWorkflow: { ...s.viewedTemplateByWorkflow, [s.workflow]: id },
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
              activeLoraOrder: next.activeLoraOrder,
              activeLoraStrengths: next.activeLoraStrengths,
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
        const paramsByWorkflow = parseParamsByWorkflow(rest.paramsByWorkflow)
        paramsByWorkflow[workflow] = mergeParams({
          ...paramsByWorkflow[workflow],
          ...rest,
          checkpoint,
          vae,
          textEncoder,
        })
        return {
          ...current,
          ...rest,
          ...paramsByWorkflow[workflow],
          modelTileStyle: parseModelTileStyle(rest.modelTileStyle),
          outputPathEnabled: typeof rest.outputPathEnabled === 'boolean' ? rest.outputPathEnabled : current.outputPathEnabled,
          activeLoraOrder,
          activeLoraStrengths,
          skippedLoras: cleanActiveLoraOrder(rest.skippedLoras),
          skippedWildcards: cleanActiveLoraOrder(rest.skippedWildcards),
          modelsByWorkflow,
          paramsByWorkflow,
        }
      },
    },
  ),
)
