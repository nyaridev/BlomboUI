import type { Glyph } from '@/components/glyph.ts'

const API = '/api'

function api(path: string) {
  return `${API}${path}`
}

export type Health = {
  ok: boolean
  api: string
  version: string
  comfy: {
    reachable: boolean
    restarting?: boolean
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
  gallery_id: string | null
  gallery_ids: string[]
  gallery?: JobGalleryItem[]
  has_grid: boolean
  grid_count: number
  created_at: string
  started_at: string | null
  finished_at: string | null
  progress: { value: number; max: number } | null
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

export type GalleryItem = {
  id: string
  created_at: string
  asset_kind?: 'image' | 'interrupted' | 'grid'
}

export type JobGeneration = JobGalleryItem
export type Generation = GalleryItem

export type PromptMatrixRequest = {
  lines: string
  save_grid: boolean
  use_batch: boolean
}

export type AutoLoraRequest = string | { path: string; strength: number }

export type JobRequest = {
  prompt: string
  negative_prompt: string
  checkpoint: string
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
  auto_loras?: AutoLoraRequest[]
  prompt_matrix?: PromptMatrixRequest
}

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { message?: string }
    return data.message || `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

export function isUnreachable(err: unknown) {
  if (!(err instanceof Error)) {
    return false
  }
  return /failed to fetch|networkerror|load failed/i.test(err.message)
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
  const res = await fetch(api('/workflows'))
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
  icon?: Glyph
}

export async function getTemplates(workflow: string): Promise<{ templates: TemplateInfo[]; apply: string[] }> {
  const res = await fetch(api(`/templates/${encodeURIComponent(workflow)}`))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { templates: TemplateInfo[]; apply?: string[] }
  return { templates: data.templates, apply: data.apply ?? [] }
}

export async function setTemplateApply(workflow: string, apply: string[]): Promise<string[]> {
  const res = await fetch(api(`/templates/${encodeURIComponent(workflow)}`), {
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
  const res = await fetch(api(`/templates/${encodeURIComponent(workflow)}`), {
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
  icon?: Glyph,
): Promise<TemplateInfo> {
  const res = await fetch(api(`/templates/${encodeURIComponent(workflow)}/${encodeURIComponent(id)}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ params, name, icon }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { template: TemplateInfo }
  return data.template
}

export async function getKSamplerChoices(): Promise<KSamplerChoices> {
  const res = await fetch(api('/comfy/ksampler'))
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
  thumb_media?: string
  thumb_global?: number
  thumb_global_media?: string
  thumb_exact?: number
  thumb_exact_media?: string
  hashes?: ModelHashes
  hashing?: boolean
  prompt?: string
  negative_prompt?: string
  notes?: string
  strength?: number
  slider?: boolean
  label?: string
  tag?: string
  source?: string
  dir?: boolean
  entries?: string[]
  types?: string[]
  auto_apply?: boolean | null
  apply_at?: 'start' | 'end' | null
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
  notes?: string
  strength?: number
  slider?: boolean
  type_options?: string[]
  thumb?: number
  thumb_media?: string
  thumb_global?: number
  thumb_global_media?: string
  thumb_exact?: number
  thumb_exact_media?: string
  auto_apply?: boolean | null
  apply_at?: 'start' | 'end' | null
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
  const res = await fetch(api('/issues'))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { issues?: GuiIssue[] }
  return Array.isArray(data.issues) ? data.issues : []
}

export type ThumbView = {
  context?: string
  mode?: 'exact' | 'likely'
  fallback?: boolean
  optional?: string
}

function thumbQs(view?: ThumbView, extra: Record<string, string> = {}) {
  const qs = new URLSearchParams(extra)
  if (view?.context) {
    qs.set('context', view.context)
  }
  if (view?.mode) {
    qs.set('mode', view.mode)
  }
  if (view?.fallback) {
    qs.set('fallback', 'true')
  }
  if (view?.optional) {
    qs.set('optional', view.optional)
  }
  const text = qs.toString()
  return text ? `?${text}` : ''
}

export async function getModels(view?: ThumbView): Promise<ModelLists> {
  const res = await fetch(api(`/user-models${thumbQs(view)}`))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as ModelLists
}

export async function getModelInfo(kind: keyof ModelLists, path: string, view?: ThumbView): Promise<ModelInfo> {
  const res = await fetch(api(`/user-models/${encodeURIComponent(kind)}/info${thumbQs(view, { path })}`))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as ModelInfo
}

export async function getModelSafetensors(kind: keyof ModelLists, path: string): Promise<Record<string, unknown>> {
  const res = await fetch(api(`/user-models/${encodeURIComponent(kind)}/safetensors?path=${encodeURIComponent(path)}`))
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
  extra?: {
    prompt?: string
    negative_prompt?: string
    notes?: string
    strength?: number
    slider?: boolean
    auto_apply?: boolean | null
    apply_at?: 'start' | 'end' | null
  },
): Promise<ModelInfo> {
  const res = await fetch(api(`/user-models/${encodeURIComponent(kind)}/info?path=${encodeURIComponent(path)}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      types,
      prompt: extra?.prompt,
      negative_prompt: extra?.negative_prompt,
      notes: extra?.notes,
      strength: extra?.strength,
      slider: extra?.slider,
      auto_apply: extra?.auto_apply,
      apply_at: extra?.apply_at,
    }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as ModelInfo
}

export type ThumbMeta = {
  v?: number
  context?: string
  tags?: string[]
  prompt?: string
  parameters?: string
  raw?: Record<string, unknown>
  origin?: string
  civitai?: Record<string, unknown>
  captured_at?: number
}

export function modelThumbUrl(
  kind: keyof ModelLists,
  path: string,
  tick = 0,
  view?: ThumbView,
  media = "",
): string {
  const extra = { path, t: String(tick), ...(media ? { media } : {}) }
  return api(`/user-models/${encodeURIComponent(kind)}/thumb${thumbQs(view, extra)}`)
}

export async function getModelThumbMeta(kind: keyof ModelLists, path: string, view?: ThumbView): Promise<ThumbMeta> {
  const res = await fetch(api(`/user-models/${encodeURIComponent(kind)}/thumb-meta${thumbQs(view, { path })}`))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as ThumbMeta
}

export async function saveModelThumb(
  kind: keyof ModelLists,
  path: string,
  file: File,
  view?: ThumbView,
  meta?: ThumbMeta,
): Promise<number> {
  const headers: Record<string, string> = { 'Content-Type': file.type || 'application/octet-stream' }
  if (meta) {
    headers['X-Blombo-Thumb-Meta'] = JSON.stringify(meta)
  }
  const res = await fetch(api(`/user-models/${encodeURIComponent(kind)}/thumb${thumbQs(view, { path })}`), {
    method: 'PUT',
    headers,
    body: file,
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { thumb: number }
  return data.thumb
}

export async function deleteModelThumb(
  kind: keyof ModelLists,
  path: string,
  view?: ThumbView,
  allContexts = false,
): Promise<number> {
  const extra: Record<string, string> = { path }
  if (allContexts) {
    extra.all_contexts = 'true'
  }
  const res = await fetch(api(`/user-models/${encodeURIComponent(kind)}/thumb${thumbQs(view, extra)}`), {
    method: 'DELETE',
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { thumb: number }
  return data.thumb
}

export async function refreshModels(kind?: keyof ModelLists, view?: ThumbView): Promise<Partial<ModelLists>> {
  const extra: Record<string, string> = {}
  if (kind) {
    extra.kind = kind
  }
  const res = await fetch(api(`/user-models/refresh${thumbQs(view, extra)}`), { method: 'POST' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as Partial<ModelLists>
}

export type ModelTreeNode = {
  name: string
  path: string
  kind: 'dir' | 'file'
  children?: ModelTreeNode[]
}

export async function getModelTree(kind: keyof ModelLists): Promise<ModelTreeNode[]> {
  const res = await fetch(api(`/user-models/${encodeURIComponent(kind)}/tree`))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { roots?: ModelTreeNode[] }
  return Array.isArray(data.roots) ? data.roots : []
}

export async function createModelFolder(
  kind: keyof ModelLists,
  folder: string,
  name: string,
): Promise<{ path: string; kind: 'dir' }> {
  const res = await fetch(api(`/user-models/${encodeURIComponent(kind)}/folder`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder, name }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as { path: string; kind: 'dir' }
}

export async function revealModelFile(kind: keyof ModelLists, path: string): Promise<void> {
  const res = await fetch(api(`/user-models/${encodeURIComponent(kind)}/open`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
}

export async function moveModelEntry(
  kind: keyof ModelLists,
  path: string,
  folder: string,
): Promise<{ path: string; kind: 'dir' | 'file' }> {
  const res = await fetch(api(`/user-models/${encodeURIComponent(kind)}/move`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, folder }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as { path: string; kind: 'dir' | 'file' }
}

export async function renameModelEntry(
  kind: keyof ModelLists,
  path: string,
  name: string,
): Promise<{ path: string; kind: 'dir' | 'file' }> {
  const res = await fetch(api(`/user-models/${encodeURIComponent(kind)}/rename`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, name }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as { path: string; kind: 'dir' | 'file' }
}

export type PngInfoResult = {
  text: string
  raw: Record<string, string>
}

export async function readPngInfo(file: File): Promise<PngInfoResult> {
  const res = await fetch(api('/pnginfo'), {
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

export type CivitaiModel = {
  id: number
  name: string
  type: string
  creator: string
  nsfw: boolean
  baseModel: string
  baseModels?: string[]
  versions?: { id: number; baseModel: string }[]
  preview: string
  downloadNames?: string[]
  downloadHashes?: string[]
  paid?: boolean
  buzz?: number
}

export type CivitaiModelImage = {
  url: string
  nsfw: boolean
}

export type CivitaiModelVersionDetail = {
  id: number
  name: string
  baseModel: string
  description: string
  trainedWords: string[]
  paid: boolean
  buzz: number
  images: CivitaiModelImage[]
  downloadUrl: string
  files: CivitaiModelFile[]
}

export type CivitaiModelFile = {
  id: number
  name: string
  downloadUrl: string
  primary: boolean
  sizeBytes: number
  hashes: Record<string, string>
  metadata?: Record<string, string>
}

export type CivitaiModelDetail = {
  id: number
  name: string
  type: string
  creator: string
  nsfw: boolean
  description: string
  tags: string[]
  stats: {
    downloadCount?: number
    favoriteCount?: number
    thumbsUpCount?: number
    rating?: number
  }
  versions: CivitaiModelVersionDetail[]
}

export type CivitaiSort =
  | 'Highest Rated'
  | 'Most Downloaded'
  | 'Most Liked'
  | 'Most Discussed'
  | 'Most Collected'
  | 'Most Images'
  | 'Newest'
  | 'Oldest'

export type CivitaiPeriod = 'AllTime' | 'Year' | 'Month' | 'Week' | 'Day'

export async function getCivitaiByHash(hash: string): Promise<CivitaiVersion | null> {
  const res = await fetch(api(`/civitai/by-hash/${encodeURIComponent(hash)}`))
  if (res.status === 404) {
    return null
  }
  if (!res.ok) {
    return null
  }
  return (await res.json()) as CivitaiVersion
}

export async function listCivitaiModels(params: {
  query: string
  types: string[]
  baseModels: string[]
  sort: CivitaiSort
  period: CivitaiPeriod
  page: number
  cursor?: string
  earlyAccess?: boolean
  supportsGeneration?: boolean
  fromPlatform?: boolean
  nsfw?: boolean
  tag?: string
  signal?: AbortSignal
}): Promise<{ items: CivitaiModel[]; page: number; hasNext: boolean; nextCursor?: string }> {
  const query = new URLSearchParams({
    query: params.query,
    sort: params.sort,
    period: params.period,
    page: String(params.page),
    nsfw: String(params.nsfw ?? true),
  })
  for (const type of params.types) {
    query.append('types', type)
  }
  for (const baseModel of params.baseModels) {
    query.append('baseModels', baseModel)
  }
  if (params.cursor) {
    query.set('cursor', params.cursor)
  }
  if (params.earlyAccess !== undefined) {
    query.set('earlyAccess', String(params.earlyAccess))
  }
  if (params.supportsGeneration !== undefined) {
    query.set('supportsGeneration', String(params.supportsGeneration))
  }
  if (params.fromPlatform !== undefined) {
    query.set('fromPlatform', String(params.fromPlatform))
  }
  if (params.tag) {
    query.set('tag', params.tag)
  }
  const res = await fetch(api(`/civitai/models?${query.toString()}`), { signal: params.signal })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as { items: CivitaiModel[]; page: number; hasNext: boolean; nextCursor?: string }
}

export async function getCivitaiModel(id: number): Promise<CivitaiModelDetail> {
  const res = await fetch(api(`/civitai/models/${id}`))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as CivitaiModelDetail
}

export async function downloadCivitaiModel(params: {
  modelId: number
  versionId: number
  fileId?: number
  customNaming: boolean
  modelName?: string
  creatorAlias?: string
}): Promise<{ modelId: number; versionId: number; kind: string; paths: string[]; creator: string; creatorAlias: string }> {
  const res = await fetch(api('/civitai/download'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as {
    modelId: number
    versionId: number
    kind: string
    paths: string[]
    creator: string
    creatorAlias: string
  }
}

export async function fetchCivitaiImage(url: string): Promise<File> {
  const res = await fetch(api(`/civitai/image?url=${encodeURIComponent(url)}`))
  if (!res.ok) {
    throw new Error(`civitai image ${res.status}`)
  }
  const blob = await res.blob()
  const type = blob.type || 'image/jpeg'
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'
  return new File([blob], `preview.${ext}`, { type })
}

export async function getHealth(): Promise<Health> {
  const res = await fetch(api('/health'))
  if (!res.ok) {
    throw new Error(`health ${res.status}`)
  }
  return (await res.json()) as Health
}

export async function getComfyStats(): Promise<ComfyStats> {
  const res = await fetch(api('/comfy/stats'))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as ComfyStats
}

export async function freeComfy(unloadModels: boolean, freeMemory: boolean): Promise<void> {
  const res = await fetch(api('/comfy/free'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ unload_models: unloadModels, free_memory: freeMemory }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
}

export type FolderDir = {
  id: string
  name: string
  path: string
}

export type UserSettings = {
  batchGrid?: boolean
  batchGridMax?: number
  batchGridQuality?: number
  batchGridRows?: number
  batchGridFill?: boolean
  batchGridOnCancel?: boolean
  saveInterrupted?: boolean
  genPreview?: boolean
  genPreviewEvery?: number
  genPreviewAfter?: number
  genPreviewAfterFirst?: boolean
  genPreviewLast?: boolean
  interruptedInGrid?: boolean
  galleryHideInterrupted?: boolean
  hiddenGenerateTabs?: string[]
  hiddenMainTabs?: string[]
  mainTabOrder?: string[]
  generateTabOrder?: string[]
  mainTabKeysFollowLayout?: boolean
  generateTabKeysFollowLayout?: boolean
  hiddenModelTypes?: string[]
  hiddenSamplers?: string[]
  hiddenSchedulers?: string[]
  theme?: string
  civitaiSite?: string
  civitaiApiKey?: string
  civitaiAutoRetry?: boolean
  civitaiAutoRetryCount?: number
  timeDisplay?: string
  setResolutions?: string[]
  imagePath?: string
  gridPath?: string
  interruptedPath?: string
  imageName?: string
  gridName?: string
  imageFormat?: string
  gridFormat?: string
  imageQuality?: number
  saveLargeAsJpeg?: boolean
  largeJpegMaxKb?: number
  gallerySortKey?: Record<string, string> | string
  gallerySortDir?: Record<string, string> | string
  galleryTileScale?: number
  galleryThumbFallback?: boolean | Record<string, boolean>
  thumbSaveTo?: 'active' | 'global'
  thumbDisplayMode?: 'likely' | 'exact'
  thumbScopeIds?: string[]
  thumbScopeOptionalIds?: string[]
  thumbScopeAuto?: boolean
  trashThumbFallback?: boolean
  galleryParentOnUnselect?: boolean
  promptWeightStep?: number
  loraStrengthMin?: number
  loraStrengthMax?: number
  loraSliderMin?: number
  loraSliderMax?: number
  loraAutoApply?: boolean
  loraApplyAt?: 'start' | 'end'
  modelDirs?: FolderDir[]
  wildcardDirs?: FolderDir[]
  galleryDirs?: FolderDir[]
  civitaiDownload?: {
    modelDirId?: string
    wildcardDirId?: string
    modelIntelligent?: boolean
    modelSortBaseModel?: boolean
    modelSortCategory?: boolean
    modelSortCreator?: boolean
    modelNaming?: string
    wildcardIntelligent?: boolean
    wildcardUnpack?: boolean
    updateModelInfo?: boolean
    authorAliases?: Record<string, string>
  }
  removedAfterHours?: number
  removedMaxGb?: number
  autocompleteEnabled?: boolean
  autocompleteMode?: string
  autocompleteTypes?: string[]
  wildcardCompleteEnabled?: boolean
  loraCompleteEnabled?: boolean
  loraTriggerCompleteEnabled?: boolean
  wildcardCompleteThumbs?: boolean
  loraCompleteThumbs?: boolean
  autocompleteThumbScale?: number
  frequentTagsEnabled?: boolean
  autocompleteLists?: Record<string, { enabled?: boolean; mode?: string; types?: string[] }>
  galleryPinSelected?: Record<string, boolean>
  scopeGroups?: string[]
  scopeOrder?: string[]
  lookupScopeIds?: string[]
  lookupScopeOptionalIds?: string[]
  lookupKinds?: string[]
  lookupModels?: string[]
  scopeSearch?: string
  modelsTab?: string
  modelsKind?: string
  civitaiBrowse?: {
    query?: string
    sort?: string
    period?: string
    types?: string[]
    baseModels?: string[]
    tag?: string
    nsfw?: boolean
    earlyAccess?: string
    supportsGeneration?: string
    fromPlatform?: string
  }
  civitaiTabs?: {
    id?: number
    name?: string
    initialVersionId?: number
    versionId?: number
  }[]
  civitaiTabId?: number | null
  galleryTypes?: Record<string, string[]>
  galleryQuery?: Record<string, string>
  galleryLocalScopes?: Record<
    string,
    { ids?: string[]; optionalIds?: string[]; auto?: boolean; mode?: string; fallback?: boolean }
  >
  galleryScopeMode?: Record<string, string>
  galleryFilterMode?: Record<string, string>
  galleryFilterShareModels?: boolean
}

export async function pickFolder(): Promise<string | null> {
  const res = await fetch(api('/pick-folder'), { method: 'POST' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { path?: string | null }
  return data.path || null
}

export type AutocompleteCsv = {
  name: string
  size: number
  downloaded: boolean
}

export async function getAutocompleteCsv(): Promise<AutocompleteCsv[]> {
  const res = await fetch(api('/autocomplete/csv'))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { files?: AutocompleteCsv[] }
  return Array.isArray(data.files) ? data.files : []
}

export async function downloadAutocompleteCsv(name: string): Promise<AutocompleteCsv> {
  const res = await fetch(api('/autocomplete/csv'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as AutocompleteCsv
}

export async function openAutocompleteFolder(): Promise<void> {
  const res = await fetch(api('/autocomplete/open'), { method: 'POST' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
}

export type PromptTagHit = {
  tag: string
  posts: number
  count: number
  favorite: boolean
  alias?: string
}

export async function suggestPromptTags(
  q: string,
  checkpoint: string,
  signal?: AbortSignal,
): Promise<{ tags: PromptTagHit[]; ready: boolean }> {
  const res = await fetch(
    api(`/autocomplete/suggest?q=${encodeURIComponent(q)}&checkpoint=${encodeURIComponent(checkpoint)}`),
    { signal },
  )
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { tags?: PromptTagHit[]; ready?: boolean }
  return {
    tags: Array.isArray(data.tags) ? data.tags : [],
    ready: data.ready !== false,
  }
}

export type FrequentPromptTag = {
  tag: string
  count: number
  favorite: boolean
}

export async function getPromptTagUsage(prefix: string, signal?: AbortSignal): Promise<FrequentPromptTag[]> {
  const res = await fetch(api(`/autocomplete/usage?prefix=${encodeURIComponent(prefix)}`), { signal })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { tags?: FrequentPromptTag[] }
  return Array.isArray(data.tags) ? data.tags : []
}

export async function getFrequentPromptTags(): Promise<{ tags: FrequentPromptTag[]; threshold: number }> {
  const res = await fetch(api('/autocomplete/frequent'))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { tags?: FrequentPromptTag[]; threshold?: number }
  return {
    tags: Array.isArray(data.tags) ? data.tags : [],
    threshold: typeof data.threshold === 'number' ? data.threshold : 2,
  }
}

export type WildcardTreeNode = {
  name: string
  path: string
  kind: 'dir' | 'file'
  children?: WildcardTreeNode[]
}

export type YamlNode = { [key: string]: YamlNode } | string[]

export type WildcardFile = {
  path: string
  format: 'txt' | 'yaml'
  lines?: string[]
  tree?: Record<string, YamlNode>
  error?: string
  text?: string
}

export async function getWildcardTree(): Promise<WildcardTreeNode[]> {
  const res = await fetch(api('/user-wildcards/tree'))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { roots?: WildcardTreeNode[] }
  return Array.isArray(data.roots) ? data.roots : []
}

export async function getWildcardFile(path: string): Promise<WildcardFile> {
  const res = await fetch(api(`/user-wildcards/file?path=${encodeURIComponent(path)}`))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as WildcardFile
}

export async function saveWildcardFile(
  path: string,
  body: { lines?: string[]; tree?: Record<string, YamlNode>; text?: string },
): Promise<WildcardFile> {
  const res = await fetch(api(`/user-wildcards/file?path=${encodeURIComponent(path)}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as WildcardFile
}

export async function createWildcardFile(folder: string, name: string): Promise<WildcardFile> {
  const res = await fetch(api('/user-wildcards/file'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder, name }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as WildcardFile
}

export async function createWildcardFolder(folder: string, name: string): Promise<{ path: string; kind: 'dir' }> {
  const res = await fetch(api('/user-wildcards/folder'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder, name }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as { path: string; kind: 'dir' }
}

export async function revealWildcardFile(path: string): Promise<void> {
  const res = await fetch(api('/user-wildcards/open'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
}

export async function moveWildcardEntry(path: string, folder: string): Promise<{ path: string; kind: 'dir' | 'file' }> {
  const res = await fetch(api('/user-wildcards/move'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, folder }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as { path: string; kind: 'dir' | 'file' }
}

export async function renameWildcardEntry(path: string, name: string): Promise<{ path: string; kind: 'dir' | 'file' }> {
  const res = await fetch(api('/user-wildcards/rename'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, name }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as { path: string; kind: 'dir' | 'file' }
}

export type RemovedItem = {
  id: string
  kind: string
  name: string
  ident: string
  removed_at: number
  size: number
  thumb: boolean
}

export async function listRemoved(): Promise<RemovedItem[]> {
  const res = await fetch(api('/user-removed'))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { items?: RemovedItem[] }
  return Array.isArray(data.items) ? data.items : []
}

export async function removeEntry(kind: keyof ModelLists, path: string): Promise<{ ids: string[]; count: number }> {
  const res = await fetch(api('/user-removed'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, path }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as { ids: string[]; count: number }
}

export async function restoreRemoved(id: string): Promise<{ path: string; kind: string }> {
  const res = await fetch(api(`/user-removed/${encodeURIComponent(id)}/restore`), { method: 'POST' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as { path: string; kind: string }
}

export async function deleteRemoved(id: string): Promise<void> {
  const res = await fetch(api(`/user-removed/${encodeURIComponent(id)}`), { method: 'DELETE' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
}

export async function deleteAllRemoved(): Promise<void> {
  const res = await fetch(api('/user-removed'), { method: 'DELETE' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
}

export async function revealRemoved(id: string): Promise<void> {
  const res = await fetch(api(`/user-removed/${encodeURIComponent(id)}/open`), { method: 'POST' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
}

export function removedThumbUrl(id: string, tick = 0, view?: ThumbView) {
  return api(`/user-removed/${encodeURIComponent(id)}/thumb${thumbQs(view, { t: String(tick) })}`)
}

export type ThumbScope = {
  id: string
  name: string
  group: string
  anyGroups: string[][]
  exclude: string[]
  priority: number
}

export type ScopeThumb = {
  kind: keyof ModelLists
  path: string
  context: string
  scopes: string[]
  mtime: number
  media?: string
}

export async function getScopeThumbs(): Promise<ScopeThumb[]> {
  const res = await fetch(api('/user-thumbs'))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { thumbs?: ScopeThumb[] }
  return Array.isArray(data.thumbs) ? data.thumbs : []
}

export async function getThumbScopes(): Promise<ThumbScope[]> {
  const res = await fetch(api('/user-scopes'))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { scopes?: ThumbScope[] }
  return Array.isArray(data.scopes) ? data.scopes : []
}

export async function createThumbScope(body: Partial<ThumbScope>): Promise<ThumbScope> {
  const res = await fetch(api('/user-scopes'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { scope: ThumbScope }
  return data.scope
}

export async function updateThumbScope(id: string, body: Partial<ThumbScope>): Promise<ThumbScope> {
  const res = await fetch(api(`/user-scopes/${encodeURIComponent(id)}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { scope: ThumbScope }
  return data.scope
}

export async function deleteThumbScope(id: string): Promise<void> {
  const res = await fetch(api(`/user-scopes/${encodeURIComponent(id)}`), { method: 'DELETE' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
}

export async function autoThumbScopes(prompt: string): Promise<string[]> {
  const res = await fetch(api(`/user-scopes/auto?prompt=${encodeURIComponent(prompt)}`))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { ids?: string[] }
  return Array.isArray(data.ids) ? data.ids : []
}

export async function formatWildcardYaml(body: {
  tree?: Record<string, YamlNode>
  text?: string
}): Promise<{ tree?: Record<string, YamlNode>; text?: string; error?: string }> {
  const res = await fetch(api('/user-wildcards/format'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as { tree?: Record<string, YamlNode>; text?: string; error?: string }
}

export type AppPaths = {
  models: string
  wildcards: string
  output: string
  userName: string
}

export async function getAppPaths(): Promise<AppPaths> {
  const res = await fetch(api('/paths'))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as AppPaths
}

export async function checkFolderPaths(paths: string[]): Promise<Record<string, boolean>> {
  const res = await fetch(api('/paths/check'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { exists?: Record<string, boolean> }
  return data.exists && typeof data.exists === 'object' ? data.exists : {}
}

export async function openFolder(path: string): Promise<void> {
  const res = await fetch(api('/paths/open'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
}

export async function setOutputPath(path: string): Promise<AppPaths> {
  const res = await fetch(api('/paths/output'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as AppPaths
}

export async function syncModelPaths(): Promise<void> {
  const res = await fetch(api('/paths/models/sync'), { method: 'POST' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
}

export async function reloadComfy(): Promise<void> {
  const res = await fetch(api('/paths/models/reload'), { method: 'POST' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
}

export async function getSettings(): Promise<UserSettings> {
  const res = await fetch(api('/user-settings'))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { settings?: UserSettings }
  return data.settings && typeof data.settings === 'object' ? data.settings : {}
}

export async function saveSettings(settings: UserSettings): Promise<UserSettings> {
  const res = await fetch(api('/user-settings'), {
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
    await fetch(api('/reload'), { method: 'POST' })
  } catch {
    return
  }
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

export async function listGalleryItems(): Promise<GalleryItem[]> {
  const res = await fetch(api('/gallery/items'))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { items?: GalleryItem[] }
  return data.items ?? []
}

export async function getLatestGalleryItem(): Promise<GalleryItem | null> {
  const res = await fetch(api('/gallery/items/latest'))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { item: GalleryItem | null }
  return data.item
}

export function galleryItemImageUrl(id: string): string {
  return api(`/gallery/items/${encodeURIComponent(id)}/image`)
}

export function galleryItemThumbUrl(id: string): string {
  return api(`/gallery/items/${encodeURIComponent(id)}/thumb`)
}

export const listGenerations = listGalleryItems
export const getLatestGeneration = getLatestGalleryItem
export const generationImageUrl = galleryItemImageUrl
export const generationThumbUrl = galleryItemThumbUrl

export function jobGridUrl(jobId: string, index = 0): string {
  return api(`/jobs/${jobId}/grid/${index}`)
}

export function jobPreviewUrl(jobId: string, tick: number): string {
  return api(`/jobs/${jobId}/preview?t=${tick}`)
}

export function jobStepPreviewUrl(jobId: string, step: number): string {
  return api(`/jobs/${jobId}/previews/${step}`)
}
