import type { Job, ModelEntry } from '@/lib/api.ts'
import { loraNameMatches, parseLoraHits } from '@/lib/prompt/loraTags.ts'
import { parseWildcardTags, wildcardMatches } from '@/lib/prompt/wildcardTags.ts'
import { autoLoraId, type AdetailerSettings, type ModelSwap } from '@/stores/generateStore.ts'
import { modelPath } from '@/stores/modelsStore.ts'

export function idsFromJob(job: Job): string[] {
  return job.gallery_ids
}

export function selectedLoraPaths(
  prompt: string,
  items: { path: string; auto_apply?: boolean | null }[],
  activeOrder: string[],
  autoDefault: boolean,
) {
  const out: string[] = []
  const seen = new Set<string>()
  for (const hit of parseLoraHits(prompt)) {
    const item = items.find((row) => loraNameMatches(hit.name, row.path))
    if (item && !seen.has(item.path)) {
      seen.add(item.path)
      out.push(item.path)
    }
  }
  for (const id of activeOrder) {
    if (!id.startsWith(autoLoraId(''))) {
      continue
    }
    const path = id.slice(autoLoraId('').length)
    const item = items.find((row) => row.path === path)
    if (path && (!item || Boolean(item.auto_apply ?? autoDefault)) && !seen.has(path)) {
      seen.add(path)
      out.push(path)
    }
  }
  return out
}

export function selectedWildcardPaths(prompt: string, items: { path: string }[]) {
  const out: string[] = []
  const seen = new Set<string>()
  for (const hit of parseWildcardTags(prompt)) {
    const item = items.find((row) => wildcardMatches(row, hit.name))
    if (item && !seen.has(item.path)) {
      seen.add(item.path)
      out.push(item.path)
    }
  }
  return out
}

export function promptMatrixLines(raw: unknown): string[] {
  const values = typeof raw === 'string' ? raw.split(/\r?\n/) : Array.isArray(raw) ? raw : []
  return values
    .map((value) => String(value).trim().replace(/,+$/, '').trim())
    .filter(Boolean)
}

function xyAxisLen(raw: unknown): number {
  if (!raw || typeof raw !== 'object') {
    return 0
  }
  const row = raw as { type?: unknown; values?: unknown }
  if (row.type === 'none') {
    return 0
  }
  return Array.isArray(row.values) ? row.values.map((item) => String(item).trim()).filter(Boolean).length : 0
}

export function xyPlotCellCount(raw: unknown): number {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return 0
  }
  const x = xyAxisLen((raw as { x?: unknown }).x)
  const y = xyAxisLen((raw as { y?: unknown }).y)
  if (!x && !y) {
    return 0
  }
  return Math.max(1, x) * Math.max(1, y)
}

export function etaSeconds(startedAt: string | null, value: number, max: number): number | null {
  if (!startedAt || value <= 0 || max <= 0) {
    return null
  }
  const elapsed = (Date.now() - Date.parse(startedAt)) / 1000
  if (!Number.isFinite(elapsed) || elapsed < 0.5) {
    return null
  }
  return Math.max(0, Math.round((elapsed * (max - value)) / value))
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds * 10) / 10}s`
  }
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${String(s).padStart(2, '0')}s`
}

export function jobSeconds(job: Job): number | null {
  if (job.status !== 'completed') {
    return null
  }
  const ms = Number(job.payload.duration_ms)
  if (Number.isFinite(ms) && ms >= 0) {
    return ms / 1000
  }
  if (job.started_at && job.finished_at) {
    const elapsed = (Date.parse(job.finished_at) - Date.parse(job.started_at)) / 1000
    if (Number.isFinite(elapsed) && elapsed >= 0) {
      return elapsed
    }
  }
  return null
}

export const PARAMS_RATIO = 0.5
export const PARAMS_MIN_REM = 18
export const PARAMS_MAX_RATIO = 0.75

export function remPx() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

export function defaultParamsWidth(row: HTMLElement | null) {
  return row && row.clientWidth > 0 ? row.clientWidth * PARAMS_RATIO : PARAMS_MIN_REM * remPx()
}

export function progressLabel(pct: number, eta: number | null): string {
  if (pct <= 0) {
    return 'Starting…'
  }
  if (eta == null) {
    return `${Math.round(pct)}%`
  }
  return `${Math.round(pct)}% ETA: ${eta}s`
}

export const HIRES_PROGRESS_SEGMENTS = ['Generation', 'Upscaling', 'Hires. fix'] as const
export const ADETAILER_PROGRESS_SEGMENT = 'ADetailer'

const STAGE_LABEL: Record<string, string> = {
  generation: 'Generation',
  upscaling: 'Upscaling',
  hires: 'Hires. fix',
  adetailer: 'ADetailer',
}

export function progressSegments(hiresOn: boolean, adetailerOn: boolean): string[] | undefined {
  if (!hiresOn && !adetailerOn) {
    return undefined
  }
  const out: string[] = [HIRES_PROGRESS_SEGMENTS[0]]
  if (hiresOn) {
    out.push(HIRES_PROGRESS_SEGMENTS[1], HIRES_PROGRESS_SEGMENTS[2])
  }
  if (adetailerOn) {
    out.push(ADETAILER_PROGRESS_SEGMENT)
  }
  return out
}

export function hiresProgressLabel(
  stage: string | undefined,
  pct: number,
  eta: number | null,
  step?: number,
  steps?: number,
): string {
  const name = (stage && STAGE_LABEL[stage]) || 'Generation'
  const counted = typeof step === 'number' && typeof steps === 'number' && steps > 0
  if (pct <= 0 && stage === 'generation') {
    return 'Starting…'
  }
  const body = counted ? `${name} · ${step} / ${steps}` : name
  if (eta == null || pct <= 0) {
    return body
  }
  return `${body} · ETA: ${eta}s`
}

export function tabForSwap(swap: ModelSwap | null) {
  if (!swap) {
    return null
  }
  if (swap.slot === 'lora') {
    return 'LoRa'
  }
  if (swap.slot === 'wildcard') {
    return 'Wildcards'
  }
  if (swap.slot === 'vae' || swap.slot === 'textEncoder') {
    return 'Other'
  }
  return 'Base Model'
}

export function hiresDiffusion(checkpoint: string, diffusionModels: ModelEntry[]) {
  return diffusionModels.some((item) => modelPath(item) === checkpoint)
}

export function packAdetailerJob(
  adetailer: AdetailerSettings,
  usedSeeds: number[],
  diffusionModels: ModelEntry[] = [],
) {
  return {
    enabled: adetailer.enabled,
    units: adetailer.units.map((unit, index) => ({
      id: unit.id,
      name: unit.name,
      enabled: unit.enabled !== false,
      detector: unit.detector,
      sam_model: unit.samModel,
      guide_size: unit.guideSize,
      guide_size_for: unit.guideSizeFor,
      max_size: unit.maxSize,
      steps: unit.steps,
      cfg: unit.cfg,
      cfg_override: unit.cfgOverride,
      denoise: unit.denoise,
      sampler: unit.sampler,
      sampler_override: unit.samplerOverride,
      scheduler: unit.scheduler,
      scheduler_override: unit.schedulerOverride,
      seed: unit.seedOverride ? (usedSeeds[index] ?? unit.seed) : unit.seed,
      seed_after: unit.seedAfter,
      seed_override: unit.seedOverride,
      prompt_override: unit.promptOverride,
      prompt: unit.prompt,
      negative_override: unit.negativeOverride,
      negative_prompt: unit.negativePrompt,
      from_hires: unit.fromHires !== false,
      advanced_override: unit.advancedOverride,
      feather: unit.feather,
      noise_mask: unit.noiseMask,
      force_inpaint: unit.forceInpaint,
      bbox_threshold: unit.bboxThreshold,
      bbox_dilation: unit.bboxDilation,
      bbox_crop_factor: unit.bboxCropFactor,
      sam_detection_hint: unit.samDetectionHint,
      sam_dilation: unit.samDilation,
      sam_threshold: unit.samThreshold,
      sam_bbox_expansion: unit.samBboxExpansion,
      sam_mask_hint_threshold: unit.samMaskHintThreshold,
      sam_mask_hint_use_negative: unit.samMaskHintUseNegative,
      drop_size: unit.dropSize,
      cycle: unit.cycle,
      inpaint_model: unit.inpaintModel,
      noise_mask_feather: unit.noiseMaskFeather,
      tiled_encode: unit.tiledEncode,
      tiled_decode: unit.tiledDecode,
      device_mode: unit.deviceMode,
      model_override: unit.modelOverride,
      checkpoint: unit.checkpoint,
      vae: unit.vae,
      text_encoder: unit.textEncoder,
      kind: hiresDiffusion(unit.checkpoint, diffusionModels) ? 'diffusion_models' : 'checkpoints',
      lora_override: unit.loraOverride,
      loras: unit.loras,
    })),
  }
}
