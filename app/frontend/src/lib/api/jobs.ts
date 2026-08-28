import { api, readError } from './http.ts'

export type Job = {
  id: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled'
  mode: string
  payload: Record<string, unknown>
  comfy_prompt_id: string | null
  error: string | null
  gallery_id: string | null
  gallery_ids: string[]
  gallery?: JobGalleryItem[]
  has_grid: boolean
  grid_count: number
  created_at: string
  started_at: string | null
  finished_at: string | null
  progress: { value: number; max: number; stage?: string; step?: number; steps?: number } | null
  job_progress: { value: number; max: number } | null
  has_preview: boolean
  preview_steps: number[]
  preview_batch?: number
  preview_rev?: number
}

export type JobLora = {
  path: string
  strength: number
  hash?: string
}

export type JobGalleryItem = {
  id: string
  kind?: string
  prompt: string
  negative_prompt: string
  seed: number | null
  width: number | null
  height: number | null
  checkpoint: string
  checkpoint_hash: string
  steps: number | null
  cfg: number | null
  sampler: string
  scheduler: string
  loras: JobLora[]
  workflow: string
  template_id: string
  template_name: string
  template_params: Record<string, unknown>
}

export type JobGeneration = JobGalleryItem

export type PromptMatrixRequest = {
  lines: string
  save_grid: boolean
  use_batch: boolean
  mode?: 'start' | 'end' | 'prompt_sr'
  target?: 'prompt' | 'negative'
  search?: string
}

export type XyPlotRequest = {
  x: { type: string; values: string[] }
  y: { type: string; values: string[] }
  draw_legend: boolean
  draw_type: boolean
  keep_minus_one: boolean
  include_sub_images: boolean
  respect_instant_lora: boolean
  grid_margin: number
}

export type AutoLoraRequest = string | { path: string; strength: number }

export type JobRequest = {
  prompt: string
  negative_prompt: string
  checkpoint: string
  vae?: string
  text_encoder?: string
  width: number
  height: number
  steps: number
  cfg: number
  seed: number
  seed_after?: string
  batch_size: number
  batch_count: number
  batch_grid: boolean
  batch_grid_max: number
  batch_grid_quality: number
  batch_grid_format?: string
  batch_grid_rows: number
  batch_grid_fill: boolean
  batch_grid_on_cancel: boolean
  save_interrupted: boolean
  interrupted_in_grid: boolean
  sampler: string
  scheduler: string
  workflow: string
  template: string
  output_image_path?: string
  output_grid_path?: string
  output_image_name?: string
  output_grid_name?: string
  output_hires_path?: string
  output_hires_name?: string
  hires?: {
    enabled: boolean
    scale: number
    size_mode: 'scale' | 'raw' | 'scaler' | 'set'
    width: number
    height: number
    aspect: string
    megapixels: number
    upscale_model: string
    steps: number
    cfg: number
    cfg_override: boolean
    sampler: string
    sampler_override: boolean
    scheduler: string
    scheduler_override: boolean
    denoise: number
    seed: number
    seed_after: 'randomize' | 'fixed' | 'increment' | 'decrement'
    seed_override: boolean
    upscale_method: string
    crop: string
    prompt_override: boolean
    prompt: string
    negative_override: boolean
    negative_prompt: string
    model_override: boolean
    checkpoint: string
    vae: string
    text_encoder: string
    kind: string
    lora_override: boolean
    loras: { path: string; strength: number }[]
    save_before: boolean
    clear_vram: boolean
  }
  auto_loras?: AutoLoraRequest[]
  prompt_matrix?: PromptMatrixRequest
  xy_plot?: XyPlotRequest
}

export async function createJob(body: JobRequest): Promise<Job> {
  const res = await fetch(api('/jobs'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { job: Job }
  return data.job
}

export async function interruptJob(id: string, mode: 'skip' | 'cancel'): Promise<Job> {
  const res = await fetch(api(`/jobs/${id}/interrupt`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { job: Job }
  return data.job
}

export async function getJob(id: string): Promise<Job> {
  const res = await fetch(api(`/jobs/${id}`))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { job: Job }
  return data.job
}

export async function getLatestJob(): Promise<Job | null> {
  const res = await fetch(api('/jobs/latest'))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { job: Job | null }
  return data.job
}

export function jobGridUrl(jobId: string, index = 0): string {
  return api(`/jobs/${jobId}/grid/${index}`)
}

export function jobPreviewUrl(jobId: string, tick: number): string {
  return api(`/jobs/${jobId}/preview?t=${tick}`)
}

export function jobStepPreviewUrl(jobId: string, step: number): string {
  return api(`/jobs/${jobId}/previews/${step}`)
}
