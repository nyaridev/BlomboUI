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
  favorite?: boolean
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

export type ScopeThumbsRequest = {
  context: string
  type: 'checkpoints' | 'loras' | 'wildcards'
  search: string
  targets: { kind: string; path: string; tag?: string }[]
  skip_existing?: boolean
  apply_after?: boolean
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
  clip_skip?: number
  clip_type?: string
  clip_device?: string
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
    attention_override: boolean
    attention_engine: 'sage' | 'flash'
    sage_attention: string
    allow_compile: boolean
  }
  auto_loras?: AutoLoraRequest[]
  prompt_matrix?: PromptMatrixRequest
  xy_plot?: XyPlotRequest
  scope_thumbs?: ScopeThumbsRequest
  adetailer?: {
    enabled: boolean
    units: {
      id: string
      name: string
      enabled: boolean
      detector: string
      sam_model: string
      guide_size: number
      guide_size_for: boolean
      max_size: number
      steps: number
      cfg: number
      cfg_override: boolean
      denoise: number
      sampler: string
      sampler_override: boolean
      scheduler: string
      scheduler_override: boolean
      seed: number
      seed_after: 'randomize' | 'fixed' | 'increment' | 'decrement'
      seed_override: boolean
      prompt_override: boolean
      prompt: string
      negative_override: boolean
      negative_prompt: string
      from_hires: boolean
      advanced_override: boolean
      feather: number
      noise_mask: boolean
      force_inpaint: boolean
      bbox_threshold: number
      bbox_dilation: number
      bbox_crop_factor: number
      sam_detection_hint: string
      sam_dilation: number
      sam_threshold: number
      sam_bbox_expansion: number
      sam_mask_hint_threshold: number
      sam_mask_hint_use_negative: string
      drop_size: number
      cycle: number
      inpaint_model: boolean
      noise_mask_feather: number
      tiled_encode: boolean
      tiled_decode: boolean
      device_mode: string
      model_override: boolean
      checkpoint: string
      vae: string
      text_encoder: string
      kind: string
      lora_override: boolean
      loras: { path: string; strength: number }[]
      attention_override: boolean
      attention_engine: 'sage' | 'flash'
      sage_attention: string
      allow_compile: boolean
    }[]
  }
  rembg?: {
    engine: 'rmbg' | 'birefnet'
    rmbg_model: string
    birefnet_model: string
    sensitivity: number
    process_res: number
    mask_blur: number
    mask_offset: number
    invert_output: boolean
    refine_foreground: boolean
    background: 'Alpha' | 'Color'
    background_color: string
    input_mode: 'files' | 'directory'
    input_dir: string
    preserve_metadata?: boolean
  }
  upscale?: {
    engine: 'model' | 'seedvr2'
    input_mode: 'files' | 'directory'
    input_dir: string
    upscale_model: string
    scale: number
    size_mode: 'scale' | 'raw' | 'scaler' | 'set' | 'max'
    width: number
    height: number
    aspect: string
    megapixels: number
    upscale_method: 'nearest-exact' | 'bilinear' | 'area' | 'bicubic' | 'lanczos'
    crop: 'disabled' | 'center'
    seed: number
    color_correction: string
    resolution: number
    max_resolution: number
    max_resolution_override: boolean
    batch_size: number
    uniform_batch_size: boolean
    temporal_overlap: number
    prepend_frames: number
    input_noise_scale: number
    latent_noise_scale: number
    offload_device: string
    enable_debug: boolean
    dit_model: string
    dit_device: string
    blocks_to_swap: number
    swap_io_components: boolean
    dit_offload_device: string
    dit_cache_model: boolean
    attention_mode: string
    vae_model: string
    vae_device: string
    encode_tiled: boolean
    encode_tile_size: number
    encode_tile_overlap: number
    decode_tiled: boolean
    decode_tile_size: number
    decode_tile_overlap: number
    tile_debug: string
    vae_offload_device: string
    vae_cache_model: boolean
    allow_compile: boolean
    compile_backend: string
    compile_mode: string
    compile_fullgraph: boolean
    compile_dynamic: boolean
    dynamo_cache_size_limit: number
    dynamo_recompile_limit: number
  }
  caption?: {
    engine: 'wd14' | 'qwen'
    qwen_backend: 'native' | 'gguf'
    wd14_model: string
    qwen_model: string
    qwen_gguf_model: string
    quantization: string
    guidance: string
    prefix: string
    suffix: string
    megapixels: number
    batch_size: number
    save_image: boolean
    override_existing: boolean
    threshold: number
    character_threshold: number
    replace_underscore: boolean
    trailing_comma: boolean
    exclude_tags: string
    prompt_source: 'preset' | 'custom'
    preset_prompt: string
    max_tokens: number
    keep_model_loaded: boolean
    seed: number
    seed_after: 'randomize' | 'fixed' | 'increment' | 'decrement'
    input_mode: 'files' | 'directory'
    input_dir: string
  }
  dataset?: {
    tab: 'sprites'
    input_mode: 'files' | 'directory'
    input_dir: string
    sprites: {
      width: number
      height: number
      padding: number
      min_area: number
      upscale_model: string
      background: 'Alpha' | 'Color'
      background_color: string
    }
  }
  attention?: {
    enabled: boolean
    engine: 'sage' | 'flash'
    sage_attention: string
    allow_compile: boolean
  }
  input_dir?: string
  input_paths?: string[]
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

export async function uploadJobImages(files: File[]): Promise<string[]> {
  const body = new FormData()
  for (const file of files) {
    body.append('files', file)
  }
  const res = await fetch(api('/jobs/uploads'), { method: 'POST', body })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { paths: string[] }
  return data.paths
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

export function jobInputUrl(jobId: string, index: number): string {
  return api(`/jobs/${jobId}/input/${index}`)
}

export function jobStepPreviewUrl(jobId: string, step: number): string {
  return api(`/jobs/${jobId}/previews/${step}`)
}
