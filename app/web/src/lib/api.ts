export type Health = {
  ok: boolean
  api: string
  version: string
  comfy: {
    reachable: boolean
    mode: string | null
    path: string | null
    url?: string
  }
}

export type ComfyStats = {
  reachable: boolean
  vram_used: number
  vram_total: number
  temp_c: number | null
}

export type Job = {
  id: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled'
  mode: string
  payload: Record<string, unknown>
  comfy_prompt_id: string | null
  error: string | null
  generation_id: string | null
  generation_ids: string[]
  has_grid: boolean
  grid_count: number
  created_at: string
  started_at: string | null
  finished_at: string | null
  progress: { value: number; max: number } | null
  job_progress: { value: number; max: number } | null
  has_preview: boolean
  preview_steps: number[]
  generations?: JobGeneration[]
}

export type JobLora = {
  path: string
  strength: number
  hash?: string
}

export type JobGeneration = {
  id: string
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
}

export type Generation = {
  id: string
  job_id: string
  path: string
  prompt: string
  negative_prompt: string
}

export type JobRequest = {
  prompt: string
  negative_prompt: string
  checkpoint: string
  width: number
  height: number
  steps: number
  cfg: number
  seed: number
  batch_size: number
  batch_count: number
  batch_grid: boolean
  batch_grid_max: number
  batch_grid_quality: number
  batch_grid_rows: number
  batch_grid_fill: boolean
  sampler: string
  scheduler: string
  workflow: string
  template: string
}

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { message?: string }
    return data.message || `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

export type KSamplerChoices = {
  samplers: string[]
  schedulers: string[]
}

export type WorkflowInfo = {
  id: string
  name: string
  category?: string
  params?: string[]
}

export async function getWorkflows(): Promise<WorkflowInfo[]> {
  const res = await fetch('/workflows')
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { workflows: WorkflowInfo[] }
  return data.workflows
}

export type TemplateInfo = {
  id: string
  name: string
  builtin: boolean
  params?: Record<string, unknown>
}

export async function getTemplates(workflow: string): Promise<{ templates: TemplateInfo[]; apply: string[] }> {
  const res = await fetch(`/templates/${encodeURIComponent(workflow)}`)
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { templates: TemplateInfo[]; apply?: string[] }
  return { templates: data.templates, apply: data.apply ?? [] }
}

export async function setTemplateApply(workflow: string, apply: string[]): Promise<string[]> {
  const res = await fetch(`/templates/${encodeURIComponent(workflow)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apply }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { apply: string[] }
  return data.apply
}

export async function createTemplate(
  workflow: string,
  name: string,
  params: Record<string, unknown>,
): Promise<TemplateInfo> {
  const res = await fetch(`/templates/${encodeURIComponent(workflow)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, params }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { template: TemplateInfo }
  return data.template
}

export async function updateTemplate(
  workflow: string,
  id: string,
  params?: Record<string, unknown>,
  name?: string,
): Promise<TemplateInfo> {
  const res = await fetch(`/templates/${encodeURIComponent(workflow)}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ params, name }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { template: TemplateInfo }
  return data.template
}

export async function getKSamplerChoices(): Promise<KSamplerChoices> {
  const res = await fetch('/comfy/ksampler')
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as KSamplerChoices
}

export type ModelEntry = {
  path: string
  added: number
  edited: number
  size: number
  thumb?: number
  prompt?: string
  negative_prompt?: string
  label?: string
  tag?: string
  source?: string
  dir?: boolean
  entries?: string[]
}

export type ModelHashes = {
  sha256: string
  autov1: string
  autov2: string
  autov3: string
}

export type ModelInfo = {
  path: string
  name: string
  size: number
  edited: number
  hash: string
  hashes?: ModelHashes
  hashing?: boolean
  types?: string[]
  prompt?: string
  negative_prompt?: string
  type_options?: string[]
  thumb?: number
}

export type ModelLists = {
  checkpoints: ModelEntry[]
  loras: ModelEntry[]
  vae: ModelEntry[]
  controlnet: ModelEntry[]
  embeddings: ModelEntry[]
  wildcards: ModelEntry[]
}

export type GuiIssue = {
  code: 'duplicate_name' | 'duplicate_tag' | 'invalid_file' | string
  kind: keyof ModelLists | string
  name: string
  message: string
  paths: string[]
}

export async function getIssues(): Promise<GuiIssue[]> {
  const res = await fetch('/issues')
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { issues?: GuiIssue[] }
  return Array.isArray(data.issues) ? data.issues : []
}

export async function getModels(): Promise<ModelLists> {
  const res = await fetch('/user-models')
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as ModelLists
}

export async function getModelInfo(kind: keyof ModelLists, path: string): Promise<ModelInfo> {
  const res = await fetch(`/user-models/${encodeURIComponent(kind)}/info?path=${encodeURIComponent(path)}`)
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as ModelInfo
}

export async function getModelSafetensors(kind: keyof ModelLists, path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`/user-models/${encodeURIComponent(kind)}/safetensors?path=${encodeURIComponent(path)}`)
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { metadata?: Record<string, unknown> }
  return data.metadata && typeof data.metadata === 'object' ? data.metadata : {}
}

export async function saveModelInfo(
  kind: keyof ModelLists,
  path: string,
  types: string[],
  extra?: { prompt?: string; negative_prompt?: string },
): Promise<string[]> {
  const res = await fetch(`/user-models/${encodeURIComponent(kind)}/info?path=${encodeURIComponent(path)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      types,
      prompt: extra?.prompt,
      negative_prompt: extra?.negative_prompt,
    }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { types: string[] }
  return data.types
}

export function modelThumbUrl(kind: keyof ModelLists, path: string, tick = 0): string {
  return `/user-models/${encodeURIComponent(kind)}/thumb?path=${encodeURIComponent(path)}&t=${tick}`
}

export async function saveModelThumb(kind: keyof ModelLists, path: string, file: File): Promise<number> {
  const res = await fetch(`/user-models/${encodeURIComponent(kind)}/thumb?path=${encodeURIComponent(path)}`, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { thumb: number }
  return data.thumb
}

export async function deleteModelThumb(kind: keyof ModelLists, path: string): Promise<number> {
  const res = await fetch(`/user-models/${encodeURIComponent(kind)}/thumb?path=${encodeURIComponent(path)}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { thumb: number }
  return data.thumb
}

export async function refreshModels(kind?: keyof ModelLists): Promise<Partial<ModelLists>> {
  const qs = kind ? `?kind=${encodeURIComponent(kind)}` : ''
  const res = await fetch(`/user-models/refresh${qs}`, { method: 'POST' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as Partial<ModelLists>
}

export type PngInfoResult = {
  text: string
  raw: Record<string, string>
}

export async function readPngInfo(file: File): Promise<PngInfoResult> {
  const res = await fetch('/pnginfo', {
    method: 'POST',
    headers: { 'X-Filename': file.name },
    body: file,
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { text?: string; raw?: Record<string, string> }
  const raw = data.raw && typeof data.raw === 'object' ? data.raw : {}
  return { text: data.text || 'No generation metadata found.', raw }
}

export type CivitaiImageMeta = {
  prompt?: string
  negativePrompt?: string
  cfgScale?: number
  steps?: number
  sampler?: string
  scheduler?: string
  seed?: number
  Size?: string
  Model?: string
  clipSkip?: number
  [key: string]: unknown
}

export type CivitaiImage = {
  url?: string
  username?: string
  type?: string
  meta?: CivitaiImageMeta | null
}

export type CivitaiVersion = {
  id: number
  modelId: number
  name?: string
  description?: string
  baseModel?: string
  trainedWords?: string[]
  images?: CivitaiImage[]
  model?: { name?: string; type?: string; description?: string; creator?: { username?: string } }
}

export async function getCivitaiByHash(hash: string): Promise<CivitaiVersion | null> {
  const res = await fetch(`/civitai/by-hash/${encodeURIComponent(hash)}`)
  if (res.status === 404) {
    return null
  }
  if (!res.ok) {
    return null
  }
  return (await res.json()) as CivitaiVersion
}

export async function fetchCivitaiImage(url: string): Promise<File> {
  const res = await fetch(`/civitai/image?url=${encodeURIComponent(url)}`)
  if (!res.ok) {
    throw new Error(`civitai image ${res.status}`)
  }
  const blob = await res.blob()
  const type = blob.type || 'image/jpeg'
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'
  return new File([blob], `preview.${ext}`, { type })
}

export async function getHealth(): Promise<Health> {
  const res = await fetch('/health')
  if (!res.ok) {
    throw new Error(`health ${res.status}`)
  }
  return (await res.json()) as Health
}

export async function getComfyStats(): Promise<ComfyStats> {
  const res = await fetch('/comfy/stats')
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as ComfyStats
}

export async function freeComfy(unloadModels: boolean, freeMemory: boolean): Promise<void> {
  const res = await fetch('/comfy/free', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ unload_models: unloadModels, free_memory: freeMemory }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
}

export type UserSettings = {
  batchGrid?: boolean
  batchGridMax?: number
  batchGridQuality?: number
  batchGridRows?: number
  batchGridFill?: boolean
  hiddenGenerateTabs?: string[]
  hiddenModelTypes?: string[]
  theme?: string
  civitaiSite?: string
  wildcardYamlByFilename?: boolean
  imagePath?: string
  gridPath?: string
  gallerySortKey?: Record<string, string> | string
  gallerySortDir?: Record<string, string> | string
  galleryTileScale?: number
}

export async function getSettings(): Promise<UserSettings> {
  const res = await fetch('/user-settings')
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { settings?: UserSettings }
  return data.settings && typeof data.settings === 'object' ? data.settings : {}
}

export async function saveSettings(settings: UserSettings): Promise<UserSettings> {
  const res = await fetch('/user-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { settings?: UserSettings }
  return data.settings && typeof data.settings === 'object' ? data.settings : settings
}

export async function reloadApp(): Promise<void> {
  try {
    await fetch('/reload', { method: 'POST' })
  } catch {
    return
  }
}

export async function createJob(body: JobRequest): Promise<Job> {
  const res = await fetch('/jobs', {
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
  const res = await fetch(`/jobs/${id}/interrupt`, {
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
  const res = await fetch(`/jobs/${id}`)
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { job: Job }
  return data.job
}

export async function getLatestJob(): Promise<Job | null> {
  const res = await fetch('/jobs/latest')
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { job: Job | null }
  return data.job
}

export async function getLatestGeneration(): Promise<Generation | null> {
  const res = await fetch('/generations/latest')
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { generation: Generation | null }
  return data.generation
}

export function generationImageUrl(id: string): string {
  return `/generations/${id}/image`
}

export function jobGridUrl(jobId: string, index = 0): string {
  return `/jobs/${jobId}/grid/${index}`
}

export function jobPreviewUrl(jobId: string, tick: number): string {
  return `/jobs/${jobId}/preview?t=${tick}`
}

export function jobStepPreviewUrl(jobId: string, step: number): string {
  return `/jobs/${jobId}/previews/${step}`
}
