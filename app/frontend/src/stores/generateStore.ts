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
import {
  DEFAULT_SCOPE_THUMBS,
  mergeScopeThumbs,
  type ScopeThumbsSettings,
} from '@/views/generate/panels/generation/sections/params/scopeThumbs.ts'
import { isHiresSizeMode, isResMode, isUpscaleSizeMode, snapDim, type HiresSizeMode, type ResMode, type UpscaleSizeMode } from '@/views/generate/panels/generation/sections/params/resolutions.ts'
import {
  AUTO_LORA_PREFIX,
  parseModelsByWorkflow,
  patchWorkflowModels,
  snapshotWorkflowModels,
  type WorkflowModels,
} from '@/stores/workflowModels.ts'
import {
  applySetWorkflow,
  hydrateFromPacks,
  workflowHasPack,
} from '@/stores/generatePersist.ts'
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

export const SEED_U32_MAX = 2 ** 32 - 1
const SEED_U32_SPAN = SEED_U32_MAX + 1

export function wrapSeed32(seed: number) {
  if (seed < 0) {
    return seed
  }
  return ((Math.round(seed) % SEED_U32_SPAN) + SEED_U32_SPAN) % SEED_U32_SPAN
}

export function randomSeed() {
  return Math.floor(Math.random() * (2 ** 53))
}

export function randomSeed32() {
  return Math.floor(Math.random() * SEED_U32_SPAN)
}

export function usedSeed(seed: number, mode: SeedAfter) {
  if (mode === 'randomize' || seed < 0) {
    return randomSeed()
  }
  return seed
}

export function usedSeed32(seed: number, mode: SeedAfter) {
  if (mode === 'randomize' || seed < 0) {
    return randomSeed32()
  }
  return wrapSeed32(seed)
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

export function nextSeed32(used: number, mode: SeedAfter, steps = 1) {
  if (mode === 'randomize') {
    return -1
  }
  if (mode === 'increment') {
    return wrapSeed32(used + steps)
  }
  if (mode === 'decrement') {
    return wrapSeed32(used - steps)
  }
  return wrapSeed32(used)
}

export type ExtraSettings = { enabled: boolean; [key: string]: unknown }

export type RembgEngine = 'rmbg' | 'birefnet'
export type RembgInputMode = 'files' | 'directory'
export type RembgBackground = 'Alpha' | 'Color'

export type RembgSettings = {
  inputMode: RembgInputMode
  inputDir: string
  engine: RembgEngine
  rmbgModel: string
  birefnetModel: string
  sensitivity: number
  processRes: number
  maskBlur: number
  maskOffset: number
  invertOutput: boolean
  refineForeground: boolean
  background: RembgBackground
  backgroundColor: string
  preserveMetadata: boolean
}

export const DEFAULT_REMBG: RembgSettings = {
  inputMode: 'files',
  inputDir: '',
  engine: 'rmbg',
  rmbgModel: 'RMBG-2.0',
  birefnetModel: 'BiRefNet-general',
  sensitivity: 1,
  processRes: 1024,
  maskBlur: 0,
  maskOffset: 0,
  invertOutput: false,
  refineForeground: false,
  background: 'Alpha',
  backgroundColor: '#222222',
  preserveMetadata: false,
}

export function mergeRembg(raw: unknown): RembgSettings {
  const base = cloneJson(DEFAULT_REMBG)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return base
  }
  const row = raw as Record<string, unknown>
  const text = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback)
  const num = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback
  const engine = text(row.engine, base.engine)
  const inputMode = text(row.inputMode ?? row.input_mode, base.inputMode)
  const background = text(row.background, base.background)
  return {
    inputMode: inputMode === 'directory' ? 'directory' : 'files',
    inputDir: text(row.inputDir ?? row.input_dir, base.inputDir),
    engine: engine === 'birefnet' ? 'birefnet' : 'rmbg',
    rmbgModel: text(row.rmbgModel ?? row.rmbg_model, base.rmbgModel) || base.rmbgModel,
    birefnetModel: text(row.birefnetModel ?? row.birefnet_model, base.birefnetModel) || base.birefnetModel,
    sensitivity: Math.max(0, Math.min(1, num(row.sensitivity, base.sensitivity))),
    processRes: Math.max(256, Math.min(2048, Math.round(num(row.processRes ?? row.process_res, base.processRes)))),
    maskBlur: Math.max(0, Math.min(64, Math.round(num(row.maskBlur ?? row.mask_blur, base.maskBlur)))),
    maskOffset: Math.max(-64, Math.min(64, Math.round(num(row.maskOffset ?? row.mask_offset, base.maskOffset)))),
    invertOutput: Boolean(row.invertOutput ?? row.invert_output ?? base.invertOutput),
    refineForeground: Boolean(row.refineForeground ?? row.refine_foreground ?? base.refineForeground),
    background: background === 'Color' ? 'Color' : 'Alpha',
    backgroundColor: text(row.backgroundColor ?? row.background_color, base.backgroundColor) || base.backgroundColor,
    preserveMetadata: Boolean(row.preserveMetadata ?? row.preserve_metadata ?? base.preserveMetadata),
  }
}

export type CaptionEngine = 'wd14' | 'qwen'
export type CaptionQwenBackend = 'native' | 'gguf'

export type CaptionSettings = {
  inputMode: RembgInputMode
  inputDir: string
  engine: CaptionEngine
  qwenBackend: CaptionQwenBackend
  wd14Model: string
  qwenModel: string
  qwenGgufModel: string
  quantization: string
  guidance: string
  prefix: string
  suffix: string
  megapixels: number
  batchSize: number
  saveImage: boolean
  overrideExisting: boolean
  threshold: number
  characterThreshold: number
  replaceUnderscore: boolean
  trailingComma: boolean
  excludeTags: string
  promptSource: 'preset' | 'custom'
  presetPrompt: string
  maxTokens: number
  keepModelLoaded: boolean
  seed: number
  seedAfter: SeedAfter
}

export const CAPTION_QWEN_PROMPT = [
  'Mark the subject as `Subject`.',
  '',
  'Caption provided image with following formula:',
  '',
  '[Medium + shot type] of Subject.',
  '[pose / action / expression], [wardrobe], [environment / background],',
  '[lighting], [camera / lens / DoF], [film / texture / color treatment].',
  '',
  'Output only the caption. No comments and notes allowed.',
].join('\n')

export const DEFAULT_CAPTION: CaptionSettings = {
  inputMode: 'files',
  inputDir: '',
  engine: 'wd14',
  qwenBackend: 'native',
  wd14Model: 'wd-v1-4-moat-tagger-v2',
  qwenModel: 'Qwen3-VL-4B-Instruct',
  qwenGgufModel: 'Qwen3VL-4B-Instruct-Q8_0.gguf',
  quantization: '8-bit (Balanced)',
  guidance: CAPTION_QWEN_PROMPT,
  prefix: '',
  suffix: '',
  megapixels: 1,
  batchSize: 1,
  saveImage: true,
  overrideExisting: true,
  threshold: 0.35,
  characterThreshold: 0.85,
  replaceUnderscore: false,
  trailingComma: false,
  excludeTags: '',
  promptSource: 'custom',
  presetPrompt: '🖼️ Detailed Description',
  maxTokens: 512,
  keepModelLoaded: true,
  seed: 1,
  seedAfter: 'fixed',
}

export function mergeCaption(raw: unknown): CaptionSettings {
  const base = cloneJson(DEFAULT_CAPTION)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return base
  }
  const row = raw as Record<string, unknown>
  const text = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback)
  const num = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback
  const engine = text(row.engine, base.engine)
  const qwenBackend = text(row.qwenBackend ?? row.qwen_backend, base.qwenBackend)
  const inputMode = text(row.inputMode ?? row.input_mode, base.inputMode)
  const saveRaw = row.saveImage ?? row.save_image
  const overrideRaw = row.overrideExisting ?? row.override_existing
  const underscoreRaw = row.replaceUnderscore ?? row.replace_underscore
  const commaRaw = row.trailingComma ?? row.trailing_comma
  const keepRaw = row.keepModelLoaded ?? row.keep_model_loaded
  const sourceRaw = text(row.promptSource ?? row.prompt_source, base.promptSource)
  const seedAfterRaw = row.seedAfter ?? row.seed_after
  return {
    inputMode: inputMode === 'directory' ? 'directory' : 'files',
    inputDir: text(row.inputDir ?? row.input_dir, base.inputDir),
    engine: engine === 'qwen' ? 'qwen' : 'wd14',
    qwenBackend: qwenBackend === 'gguf' ? 'gguf' : 'native',
    wd14Model: text(row.wd14Model ?? row.wd14_model, base.wd14Model) || base.wd14Model,
    qwenModel: text(row.qwenModel ?? row.qwen_model, base.qwenModel) || base.qwenModel,
    qwenGgufModel: text(row.qwenGgufModel ?? row.qwen_gguf_model, base.qwenGgufModel) || base.qwenGgufModel,
    quantization: text(row.quantization, base.quantization) || base.quantization,
    guidance: text(row.guidance, base.guidance),
    prefix: text(row.prefix, base.prefix),
    suffix: text(row.suffix, base.suffix),
    megapixels: Math.max(0.25, Math.min(4, num(row.megapixels, base.megapixels))),
    batchSize: Math.max(1, Math.min(16, Math.round(num(row.batchSize ?? row.batch_size ?? row.batchCount ?? row.batch_count, base.batchSize)))),
    saveImage: typeof saveRaw === 'boolean' ? saveRaw : base.saveImage,
    overrideExisting: typeof overrideRaw === 'boolean' ? overrideRaw : base.overrideExisting,
    threshold: Math.max(0, Math.min(1, num(row.threshold, base.threshold))),
    characterThreshold: Math.max(0, Math.min(1, num(row.characterThreshold ?? row.character_threshold, base.characterThreshold))),
    replaceUnderscore: typeof underscoreRaw === 'boolean' ? underscoreRaw : base.replaceUnderscore,
    trailingComma: typeof commaRaw === 'boolean' ? commaRaw : base.trailingComma,
    excludeTags: text(row.excludeTags ?? row.exclude_tags, base.excludeTags),
    promptSource: sourceRaw === 'preset' ? 'preset' : 'custom',
    presetPrompt: text(row.presetPrompt ?? row.preset_prompt, base.presetPrompt) || base.presetPrompt,
    maxTokens: Math.max(16, Math.min(8192, Math.round(num(row.maxTokens ?? row.max_tokens, base.maxTokens)))),
    keepModelLoaded: typeof keepRaw === 'boolean' ? keepRaw : base.keepModelLoaded,
    seed: wrapSeed32(Math.round(num(row.seed, base.seed))),
    seedAfter: isSeedAfter(seedAfterRaw) ? seedAfterRaw : base.seedAfter,
  }
}

export type ImageUpscaleEngine = 'model' | 'seedvr2'

export type ImageUpscaleSettings = {
  inputMode: RembgInputMode
  inputDir: string
  engine: ImageUpscaleEngine
  upscaleModel: string
  scale: number
  sizeMode: UpscaleSizeMode
  width: number
  height: number
  aspect: string
  megapixels: number
  upscaleMethod: string
  crop: string
  seed: number
  seedAfter: SeedAfter
  colorCorrection: string
  resolution: number
  maxResolution: number
  maxResolutionOverride: boolean
  batchSize: number
  uniformBatchSize: boolean
  temporalOverlap: number
  prependFrames: number
  inputNoiseScale: number
  latentNoiseScale: number
  offloadDevice: string
  enableDebug: boolean
  ditModel: string
  ditDevice: string
  blocksToSwap: number
  swapIoComponents: boolean
  ditOffloadDevice: string
  ditCacheModel: boolean
  attentionMode: string
  vaeModel: string
  vaeDevice: string
  encodeTiled: boolean
  encodeTileSize: number
  encodeTileOverlap: number
  decodeTiled: boolean
  decodeTileSize: number
  decodeTileOverlap: number
  tileDebug: string
  vaeOffloadDevice: string
  vaeCacheModel: boolean
  allowCompile: boolean
  compileBackend: string
  compileMode: string
  compileFullgraph: boolean
  compileDynamic: boolean
  dynamoCacheSizeLimit: number
  dynamoRecompileLimit: number
}

export const DEFAULT_IMAGE_UPSCALE: ImageUpscaleSettings = {
  inputMode: 'files',
  inputDir: '',
  engine: 'model',
  upscaleModel: '',
  scale: 2,
  sizeMode: 'scale',
  width: 1024,
  height: 1024,
  aspect: '2:3',
  megapixels: 1,
  upscaleMethod: 'bilinear',
  crop: 'disabled',
  seed: 42,
  seedAfter: 'fixed',
  colorCorrection: 'lab',
  resolution: 2560,
  maxResolution: 2560,
  maxResolutionOverride: false,
  batchSize: 1,
  uniformBatchSize: false,
  temporalOverlap: 0,
  prependFrames: 0,
  inputNoiseScale: 0,
  latentNoiseScale: 0,
  offloadDevice: 'cpu',
  enableDebug: false,
  ditModel: 'seedvr2_ema_7b_sharp_fp16.safetensors',
  ditDevice: 'cuda:0',
  blocksToSwap: 36,
  swapIoComponents: false,
  ditOffloadDevice: 'cpu',
  ditCacheModel: false,
  attentionMode: 'sdpa',
  vaeModel: 'ema_vae_fp16.safetensors',
  vaeDevice: 'cuda:0',
  encodeTiled: true,
  encodeTileSize: 1024,
  encodeTileOverlap: 128,
  decodeTiled: true,
  decodeTileSize: 1024,
  decodeTileOverlap: 128,
  tileDebug: 'false',
  vaeOffloadDevice: 'cpu',
  vaeCacheModel: false,
  allowCompile: false,
  compileBackend: 'inductor',
  compileMode: 'default',
  compileFullgraph: false,
  compileDynamic: false,
  dynamoCacheSizeLimit: 64,
  dynamoRecompileLimit: 128,
}

export function mergeImageUpscale(raw: unknown): ImageUpscaleSettings {
  const base = cloneJson(DEFAULT_IMAGE_UPSCALE)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return base
  }
  const row = raw as Record<string, unknown>
  const text = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback)
  const num = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback
  const engine = text(row.engine, base.engine)
  const inputMode = text(row.inputMode ?? row.input_mode, base.inputMode)
  const sizeMode = text(row.sizeMode ?? row.size_mode, base.sizeMode)
  const method = text(row.upscaleMethod ?? row.upscale_method, base.upscaleMethod)
  const crop = text(row.crop, base.crop)
  const seedAfterRaw = row.seedAfter ?? row.seed_after
  return {
    inputMode: inputMode === 'directory' ? 'directory' : 'files',
    inputDir: text(row.inputDir ?? row.input_dir, base.inputDir),
    engine: engine === 'seedvr2' ? 'seedvr2' : 'model',
    upscaleModel: text(row.upscaleModel ?? row.upscale_model, base.upscaleModel),
    scale: Math.max(1, Math.min(8, num(row.scale, base.scale))),
    sizeMode: isUpscaleSizeMode(sizeMode) ? sizeMode : base.sizeMode,
    width: Math.max(64, Math.min(4096, Math.round(num(row.width, base.width)))),
    height: Math.max(64, Math.min(4096, Math.round(num(row.height, base.height)))),
    aspect: text(row.aspect, base.aspect) || base.aspect,
    megapixels: Math.max(0.2, Math.min(4, num(row.megapixels, base.megapixels))),
    upscaleMethod: method || base.upscaleMethod,
    crop: crop || base.crop,
    seed: wrapSeed32(Math.round(num(row.seed, base.seed))),
    seedAfter: isSeedAfter(seedAfterRaw) ? seedAfterRaw : base.seedAfter,
    colorCorrection: text(row.colorCorrection ?? row.color_correction, base.colorCorrection) || base.colorCorrection,
    resolution: Math.max(64, Math.min(8192, Math.round(num(row.resolution, base.resolution)))),
    maxResolution: Math.max(0, Math.min(8192, Math.round(num(row.maxResolution ?? row.max_resolution, base.maxResolution)))),
    maxResolutionOverride: Boolean(row.maxResolutionOverride ?? row.max_resolution_override ?? base.maxResolutionOverride),
    batchSize: Math.max(1, Math.min(64, Math.round(num(row.batchSize ?? row.batch_size, base.batchSize)))),
    uniformBatchSize: Boolean(row.uniformBatchSize ?? row.uniform_batch_size ?? base.uniformBatchSize),
    temporalOverlap: Math.max(0, Math.min(64, Math.round(num(row.temporalOverlap ?? row.temporal_overlap, base.temporalOverlap)))),
    prependFrames: Math.max(0, Math.min(64, Math.round(num(row.prependFrames ?? row.prepend_frames, base.prependFrames)))),
    inputNoiseScale: Math.max(0, Math.min(1, num(row.inputNoiseScale ?? row.input_noise_scale, base.inputNoiseScale))),
    latentNoiseScale: Math.max(0, Math.min(1, num(row.latentNoiseScale ?? row.latent_noise_scale, base.latentNoiseScale))),
    offloadDevice: text(row.offloadDevice ?? row.offload_device, base.offloadDevice) || base.offloadDevice,
    enableDebug: Boolean(row.enableDebug ?? row.enable_debug ?? base.enableDebug),
    ditModel: text(row.ditModel ?? row.dit_model, base.ditModel) || base.ditModel,
    ditDevice: text(row.ditDevice ?? row.dit_device, base.ditDevice) || base.ditDevice,
    blocksToSwap: Math.max(0, Math.min(64, Math.round(num(row.blocksToSwap ?? row.blocks_to_swap, base.blocksToSwap)))),
    swapIoComponents: Boolean(row.swapIoComponents ?? row.swap_io_components ?? base.swapIoComponents),
    ditOffloadDevice: text(row.ditOffloadDevice ?? row.dit_offload_device, base.ditOffloadDevice) || base.ditOffloadDevice,
    ditCacheModel: Boolean(row.ditCacheModel ?? row.dit_cache_model ?? base.ditCacheModel),
    attentionMode: text(row.attentionMode ?? row.attention_mode, base.attentionMode) || base.attentionMode,
    vaeModel: text(row.vaeModel ?? row.vae_model, base.vaeModel) || base.vaeModel,
    vaeDevice: text(row.vaeDevice ?? row.vae_device, base.vaeDevice) || base.vaeDevice,
    encodeTiled: Boolean(row.encodeTiled ?? row.encode_tiled ?? base.encodeTiled),
    encodeTileSize: Math.max(64, Math.min(4096, Math.round(num(row.encodeTileSize ?? row.encode_tile_size, base.encodeTileSize)))),
    encodeTileOverlap: Math.max(0, Math.min(1024, Math.round(num(row.encodeTileOverlap ?? row.encode_tile_overlap, base.encodeTileOverlap)))),
    decodeTiled: Boolean(row.decodeTiled ?? row.decode_tiled ?? base.decodeTiled),
    decodeTileSize: Math.max(64, Math.min(4096, Math.round(num(row.decodeTileSize ?? row.decode_tile_size, base.decodeTileSize)))),
    decodeTileOverlap: Math.max(0, Math.min(1024, Math.round(num(row.decodeTileOverlap ?? row.decode_tile_overlap, base.decodeTileOverlap)))),
    tileDebug: text(row.tileDebug ?? row.tile_debug, base.tileDebug) || base.tileDebug,
    vaeOffloadDevice: text(row.vaeOffloadDevice ?? row.vae_offload_device, base.vaeOffloadDevice) || base.vaeOffloadDevice,
    vaeCacheModel: Boolean(row.vaeCacheModel ?? row.vae_cache_model ?? base.vaeCacheModel),
    allowCompile: Boolean(row.allowCompile ?? row.allow_compile ?? base.allowCompile),
    compileBackend: text(row.compileBackend ?? row.compile_backend, base.compileBackend) || base.compileBackend,
    compileMode: text(row.compileMode ?? row.compile_mode, base.compileMode) || base.compileMode,
    compileFullgraph: Boolean(row.compileFullgraph ?? row.compile_fullgraph ?? base.compileFullgraph),
    compileDynamic: Boolean(row.compileDynamic ?? row.compile_dynamic ?? base.compileDynamic),
    dynamoCacheSizeLimit: Math.max(1, Math.min(256, Math.round(num(row.dynamoCacheSizeLimit ?? row.dynamo_cache_size_limit, base.dynamoCacheSizeLimit)))),
    dynamoRecompileLimit: Math.max(1, Math.min(512, Math.round(num(row.dynamoRecompileLimit ?? row.dynamo_recompile_limit, base.dynamoRecompileLimit)))),
  }
}

export const SAGE_ATTENTION_MODES = [
  'auto',
  'sageattn_qk_int8_pv_fp16_cuda',
  'sageattn_qk_int8_pv_fp16_triton',
  'sageattn_qk_int8_pv_fp8_cuda',
  'sageattn_qk_int8_pv_fp8_cuda++',
  'sageattn3',
  'sageattn3_per_block_mean',
] as const

export type AttentionEngine = 'sage' | 'flash'

export type AttentionSettings = {
  enabled: boolean
  engine: AttentionEngine
  sageAttention: string
  allowCompile: boolean
}

export const DEFAULT_ATTENTION: AttentionSettings = {
  enabled: false,
  engine: 'sage',
  sageAttention: 'auto',
  allowCompile: false,
}

function isAttentionEngine(value: unknown): value is AttentionEngine {
  return value === 'sage' || value === 'flash'
}

function attentionFields(row: Record<string, unknown>, base = DEFAULT_ATTENTION) {
  const engine = row.attentionEngine ?? row.attention_engine ?? row.engine
  const sage = row.sageAttention ?? row.sage_attention
  return {
    attentionEngine: isAttentionEngine(engine) ? engine : base.engine,
    sageAttention: typeof sage === 'string' && sage ? sage : base.sageAttention,
    allowCompile: typeof (row.allowCompile ?? row.allow_compile) === 'boolean'
      ? Boolean(row.allowCompile ?? row.allow_compile)
      : base.allowCompile,
  }
}

export function mergeAttention(raw: unknown): AttentionSettings {
  const base = cloneJson(DEFAULT_ATTENTION)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return base
  }
  const row = raw as Record<string, unknown>
  const fields = attentionFields(row, base)
  return {
    enabled: Boolean(row.enabled),
    engine: fields.attentionEngine,
    sageAttention: fields.sageAttention,
    allowCompile: fields.allowCompile,
  }
}

export const SAM_DETECTION_HINTS = [
  'center-1',
  'horizontal-2',
  'vertical-2',
  'rect-4',
  'diamond-4',
  'mask-area',
  'mask-points',
  'mask-point-bbox',
  'none',
] as const

export const SAM_MASK_NEGATIVES = ['False', 'Small', 'Outter'] as const
export const SAM_DEVICE_MODES = ['Prefer GPU', 'Prefer CPU', 'CPU'] as const

export type AdetailerUnit = {
  id: string
  name: string
  enabled: boolean
  detector: string
  samModel: string
  guideSize: number
  guideSizeFor: boolean
  maxSize: number
  steps: number
  cfg: number
  cfgOverride: boolean
  denoise: number
  sampler: string
  samplerOverride: boolean
  scheduler: string
  schedulerOverride: boolean
  seed: number
  seedAfter: SeedAfter
  seedOverride: boolean
  promptOverride: boolean
  prompt: string
  negativeOverride: boolean
  negativePrompt: string
  fromHires: boolean
  advancedOverride: boolean
  feather: number
  noiseMask: boolean
  forceInpaint: boolean
  bboxThreshold: number
  bboxDilation: number
  bboxCropFactor: number
  samDetectionHint: string
  samDilation: number
  samThreshold: number
  samBboxExpansion: number
  samMaskHintThreshold: number
  samMaskHintUseNegative: string
  dropSize: number
  cycle: number
  inpaintModel: boolean
  noiseMaskFeather: number
  tiledEncode: boolean
  tiledDecode: boolean
  deviceMode: string
  modelOverride: boolean
  checkpoint: string
  vae: string
  textEncoder: string
  loraOverride: boolean
  loras: HiresLora[]
  attentionOverride: boolean
  attentionEngine: AttentionEngine
  sageAttention: string
  allowCompile: boolean
}

export type AdetailerSettings = {
  enabled: boolean
  units: AdetailerUnit[]
}

export const DEFAULT_ADETAILER_UNIT: AdetailerUnit = {
  id: 'adetailer-1',
  name: 'ADetailer 1',
  enabled: true,
  detector: '',
  samModel: '',
  guideSize: 512,
  guideSizeFor: true,
  maxSize: 1024,
  steps: 20,
  cfg: 4,
  cfgOverride: false,
  denoise: 0.5,
  sampler: 'euler_ancestral',
  samplerOverride: false,
  scheduler: 'sgm_uniform',
  schedulerOverride: false,
  seed: -1,
  seedAfter: 'randomize',
  seedOverride: false,
  promptOverride: false,
  prompt: '',
  negativeOverride: false,
  negativePrompt: '',
  fromHires: true,
  advancedOverride: false,
  feather: 5,
  noiseMask: true,
  forceInpaint: true,
  bboxThreshold: 0.5,
  bboxDilation: 10,
  bboxCropFactor: 3,
  samDetectionHint: 'center-1',
  samDilation: 0,
  samThreshold: 0.93,
  samBboxExpansion: 0,
  samMaskHintThreshold: 0.7,
  samMaskHintUseNegative: 'False',
  dropSize: 10,
  cycle: 1,
  inpaintModel: false,
  noiseMaskFeather: 20,
  tiledEncode: false,
  tiledDecode: false,
  deviceMode: 'Prefer GPU',
  modelOverride: false,
  checkpoint: '',
  vae: '',
  textEncoder: '',
  loraOverride: false,
  loras: [],
  attentionOverride: false,
  attentionEngine: 'sage',
  sageAttention: 'auto',
  allowCompile: false,
}

export function newAdetailerUnit(name = 'ADetailer'): AdetailerUnit {
  return {
    ...cloneJson(DEFAULT_ADETAILER_UNIT),
    id: crypto.randomUUID(),
    name,
  }
}

export const DEFAULT_ADETAILER: AdetailerSettings = {
  enabled: false,
  units: [cloneJson(DEFAULT_ADETAILER_UNIT)],
}

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
  cfgOverride: boolean
  sampler: string
  samplerOverride: boolean
  scheduler: string
  schedulerOverride: boolean
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
  attentionOverride: boolean
  attentionEngine: AttentionEngine
  sageAttention: string
  allowCompile: boolean
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
  steps: 25,
  cfg: 4,
  cfgOverride: false,
  sampler: 'euler',
  samplerOverride: false,
  scheduler: 'sgm_uniform',
  schedulerOverride: false,
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
  saveBefore: false,
  clearVram: false,
  attentionOverride: false,
  attentionEngine: 'sage',
  sageAttention: 'auto',
  allowCompile: false,
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

function parseHiresLoras(raw: unknown): HiresLora[] {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw.flatMap((item) => {
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
  const loras = parseHiresLoras(row.loras)
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
    cfgOverride: Boolean(row.cfgOverride ?? row.cfg_override),
    sampler: typeof row.sampler === 'string' && row.sampler ? row.sampler : base.sampler,
    samplerOverride: Boolean(row.samplerOverride ?? row.sampler_override),
    scheduler: typeof row.scheduler === 'string' && row.scheduler ? row.scheduler : base.scheduler,
    schedulerOverride: Boolean(row.schedulerOverride ?? row.scheduler_override),
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
    attentionOverride: Boolean(row.attentionOverride ?? row.attention_override),
    ...attentionFields(row, DEFAULT_ATTENTION),
  }
}

function mergeExtra(raw: unknown, fallback: ExtraSettings): ExtraSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return cloneJson(fallback)
  }
  return { ...(raw as ExtraSettings), enabled: Boolean((raw as ExtraSettings).enabled) }
}

function mergeAdetailerUnit(raw: unknown, index: number, parentFromHires = true): AdetailerUnit {
  const base = cloneJson(DEFAULT_ADETAILER_UNIT)
  const row = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const num = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback
  const flag = (a: unknown, b: unknown) => Boolean(a ?? b)
  const text = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback)
  const seedAfterRaw = row.seedAfter ?? row.seed_after
  return {
    id: text(row.id, '') || `adetailer-${index + 1}`,
    name: text(row.name, '') || `ADetailer ${index + 1}`,
    enabled: 'enabled' in row ? Boolean(row.enabled) : true,
    detector: text(row.detector, base.detector),
    samModel: text(row.samModel ?? row.sam_model, base.samModel),
    guideSize: Math.max(64, Math.min(4096, num(row.guideSize ?? row.guide_size, base.guideSize))),
    guideSizeFor: typeof (row.guideSizeFor ?? row.guide_size_for) === 'boolean' ? Boolean(row.guideSizeFor ?? row.guide_size_for) : base.guideSizeFor,
    maxSize: Math.max(64, Math.min(4096, num(row.maxSize ?? row.max_size, base.maxSize))),
    steps: Math.max(1, Math.min(150, Math.round(num(row.steps, base.steps)))),
    cfg: Math.max(1, Math.min(30, num(row.cfg, base.cfg))),
    cfgOverride: flag(row.cfgOverride, row.cfg_override),
    denoise: Math.max(0, Math.min(1, num(row.denoise, base.denoise))),
    sampler: text(row.sampler, base.sampler) || base.sampler,
    samplerOverride: flag(row.samplerOverride, row.sampler_override),
    scheduler: text(row.scheduler, base.scheduler) || base.scheduler,
    schedulerOverride: flag(row.schedulerOverride, row.scheduler_override),
    seed: Math.round(num(row.seed, base.seed)),
    seedAfter: isSeedAfter(seedAfterRaw) ? seedAfterRaw : base.seedAfter,
    seedOverride: flag(row.seedOverride, row.seed_override),
    promptOverride: flag(row.promptOverride, row.prompt_override),
    prompt: text(row.prompt, base.prompt),
    negativeOverride: flag(row.negativeOverride, row.negative_override),
    negativePrompt: text(row.negativePrompt ?? row.negative_prompt, base.negativePrompt),
    fromHires:
      'fromHires' in row || 'from_hires' in row
        ? row.fromHires !== false && row.from_hires !== false
        : parentFromHires,
    advancedOverride: flag(row.advancedOverride, row.advanced_override),
    feather: Math.max(0, Math.min(100, Math.round(num(row.feather, base.feather)))),
    noiseMask: typeof (row.noiseMask ?? row.noise_mask) === 'boolean' ? Boolean(row.noiseMask ?? row.noise_mask) : base.noiseMask,
    forceInpaint: typeof (row.forceInpaint ?? row.force_inpaint) === 'boolean' ? Boolean(row.forceInpaint ?? row.force_inpaint) : base.forceInpaint,
    bboxThreshold: Math.max(0, Math.min(1, num(row.bboxThreshold ?? row.bbox_threshold, base.bboxThreshold))),
    bboxDilation: Math.max(-512, Math.min(512, Math.round(num(row.bboxDilation ?? row.bbox_dilation, base.bboxDilation)))),
    bboxCropFactor: Math.max(1, Math.min(10, num(row.bboxCropFactor ?? row.bbox_crop_factor, base.bboxCropFactor))),
    samDetectionHint: text(row.samDetectionHint ?? row.sam_detection_hint, base.samDetectionHint) || base.samDetectionHint,
    samDilation: Math.max(-512, Math.min(512, Math.round(num(row.samDilation ?? row.sam_dilation, base.samDilation)))),
    samThreshold: Math.max(0, Math.min(1, num(row.samThreshold ?? row.sam_threshold, base.samThreshold))),
    samBboxExpansion: Math.max(0, Math.min(1000, Math.round(num(row.samBboxExpansion ?? row.sam_bbox_expansion, base.samBboxExpansion)))),
    samMaskHintThreshold: Math.max(0, Math.min(1, num(row.samMaskHintThreshold ?? row.sam_mask_hint_threshold, base.samMaskHintThreshold))),
    samMaskHintUseNegative: text(row.samMaskHintUseNegative ?? row.sam_mask_hint_use_negative, base.samMaskHintUseNegative) || base.samMaskHintUseNegative,
    dropSize: Math.max(1, Math.min(4096, Math.round(num(row.dropSize ?? row.drop_size, base.dropSize)))),
    cycle: Math.max(1, Math.min(10, Math.round(num(row.cycle, base.cycle)))),
    inpaintModel: flag(row.inpaintModel, row.inpaint_model),
    noiseMaskFeather: Math.max(0, Math.min(100, Math.round(num(row.noiseMaskFeather ?? row.noise_mask_feather, base.noiseMaskFeather)))),
    tiledEncode: flag(row.tiledEncode, row.tiled_encode),
    tiledDecode: flag(row.tiledDecode, row.tiled_decode),
    deviceMode: text(row.deviceMode ?? row.device_mode, base.deviceMode) || base.deviceMode,
    modelOverride: flag(row.modelOverride, row.model_override),
    checkpoint: text(row.checkpoint, base.checkpoint),
    vae: text(row.vae, base.vae),
    textEncoder: text(row.textEncoder ?? row.text_encoder, base.textEncoder),
    loraOverride: flag(row.loraOverride, row.lora_override),
    loras: parseHiresLoras(row.loras),
    attentionOverride: flag(row.attentionOverride, row.attention_override),
    ...attentionFields(row, DEFAULT_ATTENTION),
  }
}

function mergeAdetailer(raw: unknown): AdetailerSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return cloneJson(DEFAULT_ADETAILER)
  }
  const row = raw as Record<string, unknown>
  const unitsRaw = row.units
  const parentFromHires = row.fromHires !== false && row.from_hires !== false
  const units = Array.isArray(unitsRaw) && unitsRaw.length
    ? unitsRaw.map((item, index) => mergeAdetailerUnit(item, index, parentFromHires))
    : cloneJson(DEFAULT_ADETAILER.units)
  return {
    enabled: Boolean(row.enabled),
    units,
  }
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
  prompt: '',
  negativePrompt: '',
  checkpoint: '',
  vae: '',
  textEncoder: '',
  width: 832,
  height: 1216,
  steps: 20,
  cfg: 4,
  clipSkip: 2,
  clipType: 'stable_diffusion',
  clipDevice: 'default',
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
  workflow: 'sd15',
  hires: cloneJson(DEFAULT_HIRES),
  adetailer: cloneJson(DEFAULT_ADETAILER),
  controlnet: { ...DEFAULT_EXTRA } as ExtraSettings,
  script: '' as GenerateScript,
  promptMatrix: cloneJson(DEFAULT_PROMPT_MATRIX),
  xyPlot: cloneJson(DEFAULT_XY_PLOT),
  scopeThumbs: cloneJson(DEFAULT_SCOPE_THUMBS),
  rembg: cloneJson(DEFAULT_REMBG),
  imageUpscale: cloneJson(DEFAULT_IMAGE_UPSCALE),
  caption: cloneJson(DEFAULT_CAPTION),
  attention: cloneJson(DEFAULT_ATTENTION),
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
  'clipSkip',
  'clipType',
  'clipDevice',
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
  'controlnet',
  'hires',
  'adetailer',
  'script',
  'promptMatrix',
  'xyPlot',
  'scopeThumbs',
  'rembg',
  'imageUpscale',
  'caption',
  'attention',
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
  clipSkip: number
  clipType: string
  clipDevice: string
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
  adetailer: AdetailerSettings
  controlnet: ExtraSettings
  script: GenerateScript
  promptMatrix: PromptMatrixSettings
  xyPlot: XyPlotSettings
  scopeThumbs: ScopeThumbsSettings
  rembg: RembgSettings
  imageUpscale: ImageUpscaleSettings
  caption: CaptionSettings
  attention: AttentionSettings
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
    clipSkip: source.clipSkip,
    clipType: source.clipType,
    clipDevice: source.clipDevice,
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
    adetailer: mergeAdetailer(source.adetailer),
    controlnet: cloneJson(source.controlnet),
    script: source.script,
    promptMatrix: cloneJson(source.promptMatrix),
    xyPlot: cloneJson(source.xyPlot),
    scopeThumbs: cloneJson(source.scopeThumbs ?? DEFAULT_SCOPE_THUMBS),
    rembg: mergeRembg(source.rembg),
    imageUpscale: mergeImageUpscale(source.imageUpscale),
    caption: mergeCaption(source.caption),
    attention: mergeAttention(source.attention),
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
      if (key === 'adetailer') {
        next.adetailer = mergeAdetailer(value)
        continue
      }
      if (key === 'controlnet') {
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
      if (key === 'scopeThumbs') {
        next.scopeThumbs = mergeScopeThumbs(value)
        continue
      }
      if (key === 'rembg') {
        next.rembg = mergeRembg(value)
        continue
      }
      if (key === 'imageUpscale') {
        next.imageUpscale = mergeImageUpscale(value)
        continue
      }
      if (key === 'caption') {
        next.caption = mergeCaption(value)
        continue
      }
      if (key === 'attention') {
        next.attention = mergeAttention(value)
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
  if (typeof next.clipSkip === 'number' && Number.isFinite(next.clipSkip)) {
    next.clipSkip = Math.max(0, Math.min(10, Math.round(next.clipSkip)))
  } else {
    next.clipSkip = DEFAULTS.clipSkip
  }
  if (!raw || raw.seedAfter == null) {
    next.seedAfter = next.seed < 0 ? 'randomize' : 'fixed'
  }
  return next
}

export { workflowHasPack }

function parseIdList(raw: unknown, cap?: number): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') {
      continue
    }
    const id = item.trim()
    if (!id || out.includes(id)) {
      continue
    }
    out.push(id)
    if (cap != null && out.length >= cap) {
      break
    }
  }
  return out
}

function parseIdMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const name = key.trim()
    if (name && typeof value === 'string') {
      out[name] = value
    }
  }
  return out
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

type ApplyField = {
  id: string
  label: string
  keys: readonly (keyof TemplateParams)[]
  nested?: readonly string[]
}

function rembgApply(id: string, label: string, nested: readonly (keyof RembgSettings)[]): ApplyField {
  return { id, label, keys: ['rembg'], nested }
}

function upscaleApply(id: string, label: string, nested: readonly (keyof ImageUpscaleSettings)[]): ApplyField {
  return { id, label, keys: ['imageUpscale'], nested }
}

function captionApply(id: string, label: string, nested: readonly (keyof CaptionSettings)[]): ApplyField {
  return { id, label, keys: ['caption'], nested }
}

function adetailerApply(id: string, label: string, nested: readonly (keyof AdetailerUnit)[]): ApplyField {
  return { id, label, keys: ['adetailer'], nested }
}

function hiresApply(id: string, label: string, nested: readonly (keyof HiresSettings)[]): ApplyField {
  return { id, label, keys: ['hires'], nested: ['enabled', ...nested] }
}

function isAdetailerApply(field: ApplyField) {
  return field.keys[0] === 'adetailer' && Boolean(field.nested?.length)
}

function isHiresApply(field: ApplyField) {
  return field.keys[0] === 'hires' && Boolean(field.nested?.length)
}

const UPSCALE_ADVANCED_KEYS = [
  'temporalOverlap',
  'prependFrames',
  'offloadDevice',
  'enableDebug',
  'ditDevice',
  'blocksToSwap',
  'swapIoComponents',
  'ditOffloadDevice',
  'ditCacheModel',
  'attentionMode',
  'vaeDevice',
  'encodeTiled',
  'encodeTileSize',
  'encodeTileOverlap',
  'decodeTiled',
  'decodeTileSize',
  'decodeTileOverlap',
  'tileDebug',
  'vaeOffloadDevice',
  'vaeCacheModel',
  'allowCompile',
  'compileBackend',
  'compileMode',
  'compileFullgraph',
  'compileDynamic',
  'dynamoCacheSizeLimit',
  'dynamoRecompileLimit',
] as const satisfies readonly (keyof ImageUpscaleSettings)[]

const ADETAILER_ADVANCED_KEYS = [
  'guideSizeFor',
  'feather',
  'noiseMask',
  'forceInpaint',
  'bboxThreshold',
  'bboxDilation',
  'bboxCropFactor',
  'samDetectionHint',
  'samDilation',
  'samThreshold',
  'samBboxExpansion',
  'samMaskHintThreshold',
  'samMaskHintUseNegative',
  'dropSize',
  'cycle',
  'inpaintModel',
  'noiseMaskFeather',
  'tiledEncode',
  'tiledDecode',
  'deviceMode',
] as const satisfies readonly (keyof AdetailerUnit)[]

export const APPLY_FIELDS: readonly ApplyField[] = [
  { id: 'prompt', label: 'Prompt', keys: ['prompt'] },
  { id: 'negativePrompt', label: 'Negative', keys: ['negativePrompt'] },
  { id: 'checkpoint', label: 'Checkpoint', keys: ['checkpoint'] },
  { id: 'vae', label: 'VAE', keys: ['vae'] },
  { id: 'textEncoder', label: 'Text encoder', keys: ['textEncoder'] },
  { id: 'loras', label: 'LoRAs', keys: ['activeLoraOrder', 'activeLoraStrengths'] },
  { id: 'sampler', label: 'Sampler', keys: ['sampler'] },
  { id: 'scheduler', label: 'Scheduler', keys: ['scheduler'] },
  { id: 'steps', label: 'Steps', keys: ['steps'] },
  { id: 'clipSkip', label: 'Clip skip', keys: ['clipSkip'] },
  { id: 'clipType', label: 'CLIP type', keys: ['clipType'] },
  { id: 'clipDevice', label: 'CLIP device', keys: ['clipDevice'] },
  { id: 'cfg', label: 'CFG', keys: ['cfg'] },
  { id: 'seed', label: 'Seed', keys: ['seed', 'seedAfter'] },
  { id: 'attention', label: 'Attention', keys: ['attention'] },
  { id: 'outputPath', label: 'Output path', keys: ['outputImagePath', 'outputGridPath', 'outputImageName', 'outputGridName', 'outputHiresPath', 'outputHiresName', 'outputPathEnabled'] },
  { id: 'resolution', label: 'Resolution', keys: ['width', 'height', 'resMode', 'aspect', 'megapixels'] },
  { id: 'batchCount', label: 'Batch count', keys: ['batchCount'] },
  { id: 'batchSize', label: 'Batch size', keys: ['batchSize'] },
  { id: 'controlnet', label: 'ControlNet', keys: ['controlnet'] },
  hiresApply('hiresModel', 'Upscale model', ['upscaleModel']),
  hiresApply('hiresSize', 'Size', ['sizeMode', 'scale', 'width', 'height', 'aspect', 'megapixels']),
  hiresApply('hiresSteps', 'Steps', ['steps']),
  hiresApply('hiresDenoise', 'Denoise', ['denoise']),
  hiresApply('hiresMethod', 'Method', ['upscaleMethod']),
  hiresApply('hiresCrop', 'Crop', ['crop']),
  hiresApply('hiresSaveBefore', 'Save before', ['saveBefore']),
  hiresApply('hiresClearVram', 'Clear VRAM', ['clearVram']),
  hiresApply('hiresModels', 'Models', ['modelOverride', 'checkpoint', 'vae', 'textEncoder', 'loraOverride', 'loras']),
  hiresApply('hiresPrompt', 'Prompt', ['promptOverride', 'prompt']),
  hiresApply('hiresNegative', 'Negative', ['negativeOverride', 'negativePrompt']),
  hiresApply('hiresSampler', 'Sampler', ['samplerOverride', 'sampler']),
  hiresApply('hiresScheduler', 'Scheduler', ['schedulerOverride', 'scheduler']),
  hiresApply('hiresCfg', 'CFG', ['cfgOverride', 'cfg']),
  hiresApply('hiresSeed', 'Seed', ['seedOverride', 'seed', 'seedAfter']),
  hiresApply('hiresAttention', 'Attention', ['attentionOverride', 'attentionEngine', 'sageAttention', 'allowCompile']),
  adetailerApply('adetailerDetector', 'Detector', ['detector']),
  adetailerApply('adetailerSam', 'SAM', ['samModel']),
  adetailerApply('adetailerGuideSize', 'Guide size', ['guideSize']),
  adetailerApply('adetailerMaxSize', 'Max size', ['maxSize']),
  adetailerApply('adetailerSteps', 'Steps', ['steps']),
  adetailerApply('adetailerDenoise', 'Denoise', ['denoise']),
  adetailerApply('adetailerFromHires', 'Use Hires. fix', ['fromHires']),
  adetailerApply('adetailerModels', 'Models', ['modelOverride', 'checkpoint', 'vae', 'textEncoder', 'loraOverride', 'loras']),
  adetailerApply('adetailerPrompt', 'Prompt', ['promptOverride', 'prompt']),
  adetailerApply('adetailerNegative', 'Negative', ['negativeOverride', 'negativePrompt']),
  adetailerApply('adetailerSampler', 'Sampler', ['samplerOverride', 'sampler']),
  adetailerApply('adetailerScheduler', 'Scheduler', ['schedulerOverride', 'scheduler']),
  adetailerApply('adetailerCfg', 'CFG', ['cfgOverride', 'cfg']),
  adetailerApply('adetailerSeed', 'Seed', ['seedOverride', 'seed', 'seedAfter']),
  adetailerApply('adetailerAttention', 'Attention', ['attentionOverride', 'attentionEngine', 'sageAttention', 'allowCompile']),
  adetailerApply('adetailerAdvanced', 'Advanced', ADETAILER_ADVANCED_KEYS),
  { id: 'scripts', label: 'Scripts', keys: ['script', 'promptMatrix', 'xyPlot', 'scopeThumbs'] },
  rembgApply('rembgEngine', 'Engine', ['engine']),
  rembgApply('rembgModel', 'Model', ['rmbgModel', 'birefnetModel']),
  rembgApply('rembgSensitivity', 'Sensitivity', ['sensitivity']),
  rembgApply('rembgProcessRes', 'Process resolution', ['processRes']),
  rembgApply('rembgMaskBlur', 'Mask blur', ['maskBlur']),
  rembgApply('rembgMaskOffset', 'Mask offset', ['maskOffset']),
  rembgApply('rembgBackground', 'Background', ['background', 'backgroundColor']),
  rembgApply('rembgInvert', 'Invert output', ['invertOutput']),
  rembgApply('rembgRefine', 'Refine foreground', ['refineForeground']),
  rembgApply('rembgPreserve', 'Preserve metadata', ['preserveMetadata']),
  upscaleApply('upscaleEngine', 'Engine', ['engine']),
  upscaleApply('upscaleModel', 'Upscale model', ['upscaleModel']),
  upscaleApply('upscaleDitModel', 'DiT model', ['ditModel']),
  upscaleApply('upscaleVaeModel', 'VAE model', ['vaeModel']),
  upscaleApply('upscaleSize', 'Size', ['sizeMode', 'scale', 'width', 'height', 'aspect', 'megapixels', 'maxResolution']),
  upscaleApply('upscaleMethod', 'Method', ['upscaleMethod']),
  upscaleApply('upscaleCrop', 'Crop', ['crop']),
  upscaleApply('upscaleResolution', 'Resolution', ['resolution']),
  upscaleApply('upscaleMaxResolution', 'Max resolution', ['maxResolution', 'maxResolutionOverride']),
  upscaleApply('upscaleColor', 'Color correction', ['colorCorrection']),
  upscaleApply('upscaleInputNoise', 'Input noise', ['inputNoiseScale']),
  upscaleApply('upscaleLatentNoise', 'Latent noise', ['latentNoiseScale']),
  upscaleApply('upscaleSeed', 'Seed', ['seed', 'seedAfter']),
  upscaleApply('upscaleAdvanced', 'Advanced', UPSCALE_ADVANCED_KEYS),
  captionApply('captionEngine', 'Engine', ['engine', 'qwenBackend']),
  captionApply('captionModel', 'Model', ['wd14Model', 'qwenModel', 'qwenGgufModel']),
  captionApply('captionQuantization', 'Quantization', ['quantization']),
  captionApply('captionMegapixels', 'Megapixels', ['megapixels']),
  captionApply('captionBatch', 'Batch size', ['batchSize']),
  captionApply('captionGuidance', 'Prompt', ['promptSource', 'presetPrompt', 'guidance']),
  captionApply('captionPrefix', 'Prefix', ['prefix']),
  captionApply('captionSuffix', 'Suffix', ['suffix']),
  captionApply('captionSaveImage', 'Save image', ['saveImage']),
  captionApply('captionOverride', 'Override existing', ['overrideExisting']),
  captionApply('captionThreshold', 'Threshold', ['threshold']),
  captionApply('captionCharacterThreshold', 'Character threshold', ['characterThreshold']),
  captionApply('captionReplaceUnderscore', 'Replace underscore', ['replaceUnderscore']),
  captionApply('captionTrailingComma', 'Trailing comma', ['trailingComma']),
  captionApply('captionExcludeTags', 'Exclude tags', ['excludeTags']),
  captionApply('captionMaxTokens', 'Max tokens', ['maxTokens']),
  captionApply('captionKeepModelLoaded', 'Keep model loaded', ['keepModelLoaded']),
  captionApply('captionSeed', 'Seed', ['seed', 'seedAfter']),
]

const CONTENT_APPLY = new Set(['prompt', 'negativePrompt', 'checkpoint', 'vae', 'textEncoder', 'loras'])
const UTILITY_APPLY = new Set(
  APPLY_FIELDS.filter((field) => field.nested && field.keys[0] !== 'adetailer' && field.keys[0] !== 'hires').map(
    (field) => field.id,
  ),
)
const ADETAILER_APPLY = APPLY_FIELDS.filter(isAdetailerApply).map((field) => field.id)
const HIRES_APPLY = APPLY_FIELDS.filter(isHiresApply).map((field) => field.id)

export const DEFAULT_APPLY = APPLY_FIELDS.map((field) => field.id).filter(
  (id) => !CONTENT_APPLY.has(id) && !UTILITY_APPLY.has(id),
)

export function templateApplyFields(workflowParams: string[]) {
  if (workflowParams.includes('rembg')) {
    return APPLY_FIELDS.filter((field) => field.keys[0] === 'rembg' || field.id === 'outputPath')
  }
  if (workflowParams.includes('upscale')) {
    return APPLY_FIELDS.filter((field) => field.keys[0] === 'imageUpscale' || field.id === 'outputPath')
  }
  if (workflowParams.includes('caption')) {
    return APPLY_FIELDS.filter((field) => field.keys[0] === 'caption' || field.id === 'outputPath')
  }
  return APPLY_FIELDS.filter((field) => {
    if (field.id === 'checkpoint' || field.id === 'vae' || field.id === 'textEncoder' || field.id === 'loras') {
      return false
    }
    if (field.nested) {
      return field.keys[0] === 'adetailer' || field.keys[0] === 'hires'
    }
    if (field.id === 'clipSkip') {
      return workflowParams.includes('clipSkip')
    }
    if (field.id === 'clipType' || field.id === 'clipDevice') {
      return workflowParams.includes(field.id)
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

export function applyOf(raw?: string[] | null): string[] {
  if (raw == null) {
    return [...DEFAULT_APPLY]
  }
  const known = new Set<string>(APPLY_FIELDS.map((field) => field.id))
  const seen: string[] = []
  for (const id of raw) {
    const ids = id === 'adetailer' ? ADETAILER_APPLY : id === 'hires' ? HIRES_APPLY : known.has(id) ? [id] : []
    for (const next of ids) {
      if (!seen.includes(next)) {
        seen.push(next)
      }
    }
  }
  return seen
}

export function applyEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false
  }
  const set = new Set(a)
  return b.every((id) => set.has(id))
}

function nestedSame(from: TemplateParams, to: TemplateParams, field: ApplyField) {
  const nested = field.nested
  if (!nested?.length) {
    return field.keys.every((key) => sameParam(from[key], to[key]))
  }
  if (isAdetailerApply(field)) {
    const left = from.adetailer
    const right = to.adetailer
    if (left.enabled !== right.enabled) {
      return false
    }
    const lu = left.units ?? []
    const ru = right.units ?? []
    if (lu.length !== ru.length) {
      return false
    }
    return lu.every((unit, index) => nested.every((name) => sameParam(unit[name], ru[index]?.[name])))
  }
  const key = field.keys[0]
  const left = from[key] as Record<string, unknown> | undefined
  const right = to[key] as Record<string, unknown> | undefined
  return nested.every((name) => sameParam(left?.[name], right?.[name]))
}

function nestedFormat(params: TemplateParams, field: ApplyField) {
  const nested = field.nested
  if (!nested?.length) {
    return field.keys.map((key) => formatParamValue(params[key])).join(', ')
  }
  if (isAdetailerApply(field)) {
    const blob = params.adetailer
    const parts = [formatParamValue(blob.enabled)]
    for (const unit of blob.units ?? []) {
      for (const name of nested) {
        parts.push(formatParamValue(unit[name]))
      }
    }
    return parts.join(', ')
  }
  const blob = params[field.keys[0]] as Record<string, unknown> | undefined
  return nested.map((name) => formatParamValue(blob?.[name])).join(', ')
}

function assignAdetailer(next: TemplateParams, source: TemplateParams, nested: readonly string[]) {
  const current = next.adetailer
  const incoming = source.adetailer
  const blob = cloneJson(current)
  blob.enabled = Boolean(incoming.enabled)
  const srcUnits = incoming.units ?? []
  const dstUnits = blob.units?.length ? [...blob.units] : []
  while (dstUnits.length < srcUnits.length) {
    dstUnits.push(newAdetailerUnit(`ADetailer ${dstUnits.length + 1}`))
  }
  for (let index = 0; index < srcUnits.length; index += 1) {
    const src = srcUnits[index] as Record<string, unknown>
    const dst = { ...dstUnits[index] } as Record<string, unknown>
    for (const name of nested) {
      const value = src[name]
      dst[name] = typeof value === 'object' && value != null ? cloneJson(value) : value
    }
    dstUnits[index] = dst as AdetailerUnit
  }
  blob.units = dstUnits
  next.adetailer = blob
}

function assignNested(next: TemplateParams, source: TemplateParams, field: ApplyField) {
  const nested = field.nested
  if (!nested?.length) {
    for (const key of field.keys) {
      const value = source[key]
      ;(next as Record<string, unknown>)[key] = typeof value === 'object' && value != null ? cloneJson(value) : value
    }
    return
  }
  if (isAdetailerApply(field)) {
    assignAdetailer(next, source, nested)
    return
  }
  const key = field.keys[0]
  const current = next[key]
  const incoming = source[key]
  if (typeof current !== 'object' || current == null || typeof incoming !== 'object' || incoming == null) {
    return
  }
  const blob = cloneJson(current) as Record<string, unknown>
  const src = incoming as Record<string, unknown>
  for (const name of nested) {
    blob[name] = src[name]
  }
  ;(next as Record<string, unknown>)[key] = blob
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
    assignNested(next, source, field)
  }
  next.cfg = Math.max(1, next.cfg)
  next.clipSkip = Math.max(0, Math.min(10, Math.round(next.clipSkip)))
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
    if (nestedSame(from, to, field)) {
      continue
    }
    diffs.push({
      id: field.id,
      label: field.label,
      from: field.id === 'scripts' ? formatParamValue(from.script) : nestedFormat(from, field),
      to: field.id === 'scripts' ? formatParamValue(to.script) : nestedFormat(to, field),
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
    if (!nestedSame(a, b, field)) {
      return false
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
  clipSkip: number
  clipType: string
  clipDevice: string
  seed: number
  batchSize: number
  batchCount: number
  sampler: string
  scheduler: string
  resMode: ResMode
  aspect: string
  megapixels: number
  hires: HiresSettings
  adetailer: AdetailerSettings
  controlnet: ExtraSettings
  script: GenerateScript
  promptMatrix: PromptMatrixSettings
  xyPlot: XyPlotSettings
  scopeThumbs: ScopeThumbsSettings
  rembg: RembgSettings
  rembgFiles: File[]
  imageUpscale: ImageUpscaleSettings
  imageUpscaleFiles: File[]
  caption: CaptionSettings
  captionFiles: File[]
  attention: AttentionSettings
  workflow: string
  recentWorkflowIds: string[]
  favoriteWorkflowIds: string[]
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
  setClipSkip: (value: number) => void
  setClipType: (value: string) => void
  setClipDevice: (value: string) => void
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
  setAdetailer: (value: Partial<AdetailerSettings>) => void
  setControlnet: (value: Partial<ExtraSettings>) => void
  setScript: (value: GenerateScript) => void
  setPromptMatrix: (value: PromptMatrixSettings) => void
  setXyPlot: (value: XyPlotSettings) => void
  setScopeThumbs: (value: ScopeThumbsSettings) => void
  setRembg: (value: Partial<RembgSettings>) => void
  setRembgFiles: (value: File[]) => void
  setImageUpscale: (value: Partial<ImageUpscaleSettings>) => void
  setImageUpscaleFiles: (value: File[]) => void
  setCaption: (value: Partial<CaptionSettings>) => void
  setCaptionFiles: (value: File[]) => void
  setAttention: (value: Partial<AttentionSettings>) => void
  setWorkflow: (value: string, defaults?: Partial<TemplateParams> | Record<string, unknown>) => void
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
      recentWorkflowIds: [],
      favoriteWorkflowIds: [],
      templateId: 'default',
      templateByWorkflow: {},
      viewedTemplateByWorkflow: {},
      paramsByWorkflow: {},
      modelsByWorkflow: {},
      viewedImageUrl: null,
      rembgFiles: [],
      imageUpscaleFiles: [],
      captionFiles: [],
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
      setClipSkip: (clipSkip) => set({ clipSkip: Math.max(0, Math.min(10, Math.round(clipSkip))) }),
      setClipType: (clipType) => set({ clipType }),
      setClipDevice: (clipDevice) => set({ clipDevice }),
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
      setAdetailer: (adetailer) => set((s) => ({ adetailer: mergeAdetailer({ ...s.adetailer, ...adetailer }) })),
      setControlnet: (controlnet) => set((s) => ({ controlnet: { ...s.controlnet, ...controlnet } })),
      setScript: (script) => set({ script: isGenerateScript(script) ? script : '' }),
      setPromptMatrix: (promptMatrix) => set({ promptMatrix: mergePromptMatrix(promptMatrix) }),
      setXyPlot: (xyPlot) => set({ xyPlot: mergeXyPlot(xyPlot) }),
      setScopeThumbs: (scopeThumbs) => set({ scopeThumbs: mergeScopeThumbs(scopeThumbs) }),
      setRembg: (rembg) => set((s) => ({ rembg: mergeRembg({ ...s.rembg, ...rembg }) })),
      setRembgFiles: (rembgFiles) => set({ rembgFiles }),
      setImageUpscale: (imageUpscale) =>
        set((s) => ({ imageUpscale: mergeImageUpscale({ ...s.imageUpscale, ...imageUpscale }) })),
      setImageUpscaleFiles: (imageUpscaleFiles) => set({ imageUpscaleFiles }),
      setCaption: (caption) => set((s) => ({ caption: mergeCaption({ ...s.caption, ...caption }) })),
      setCaptionFiles: (captionFiles) => set({ captionFiles }),
      setAttention: (attention) => set((s) => ({ attention: mergeAttention({ ...s.attention, ...attention }) })),
      setWorkflow: (workflow, defaults) =>
        set((s) =>
          applySetWorkflow(s, workflow, defaults, {
            pickParams,
            mergeParams: (raw) => mergeParams(raw as Partial<TemplateParams> | Record<string, unknown> | undefined),
          }),
        ),
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
      partialize: (s) => {
        const { viewedImageUrl: _viewed, swapTarget: _swap, rembgFiles: _files, imageUpscaleFiles: _upscaleFiles, captionFiles: _captionFiles, ...rest } = s
        return {
          ...rest,
          paramsByWorkflow: { ...s.paramsByWorkflow, [s.workflow]: pickParams(s) },
          modelsByWorkflow: { ...s.modelsByWorkflow, [s.workflow]: snapshotWorkflowModels(s) },
        }
      },
      merge: (persisted, current) => {
        const rest = persisted && typeof persisted === 'object' ? (persisted as Record<string, unknown>) : {}
        const workflow = typeof rest.workflow === 'string' && rest.workflow ? rest.workflow : current.workflow
        const paramsByWorkflow = parseParamsByWorkflow(rest.paramsByWorkflow)
        const modelsByWorkflow = parseModelsByWorkflow(rest.modelsByWorkflow, '')
        const templateByWorkflow = parseIdMap(rest.templateByWorkflow)
        const viewedTemplateByWorkflow = parseIdMap(rest.viewedTemplateByWorkflow)
        return hydrateFromPacks(current, rest, paramsByWorkflow, modelsByWorkflow, workflow, {
          templateByWorkflow,
          viewedTemplateByWorkflow,
          recentWorkflowIds: parseIdList(rest.recentWorkflowIds, 5),
          favoriteWorkflowIds: parseIdList(rest.favoriteWorkflowIds),
          templateId: templateByWorkflow[workflow] ?? 'default',
          modelTileStyle: parseModelTileStyle(rest.modelTileStyle),
          outputPathEnabled:
            typeof rest.outputPathEnabled === 'boolean' ? rest.outputPathEnabled : current.outputPathEnabled,
        })
      },
    },
  ),
)
