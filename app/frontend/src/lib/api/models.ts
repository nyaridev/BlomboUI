import { api, readError } from './http.ts'

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
  thumb_any?: number
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
  thumb_any?: number
  auto_apply?: boolean | null
  apply_at?: 'start' | 'end' | null
}

export type ModelLists = {
  checkpoints: ModelEntry[]
  loras: ModelEntry[]
  vae: ModelEntry[]
  controlnet: ModelEntry[]
  embeddings: ModelEntry[]
  diffusion_models: ModelEntry[]
  text_encoders: ModelEntry[]
  upscale_models: ModelEntry[]
  sams: ModelEntry[]
  ultralytics: ModelEntry[]
  wildcards: ModelEntry[]
}

export type GuiIssue = {
  id?: number
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

export async function postIssueLog(body: {
  kind: string
  code: string
  name?: string
  message: string
  paths?: string[]
}): Promise<void> {
  const res = await fetch(api('/issues'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
}

export async function dismissIssue(id: number): Promise<void> {
  const res = await fetch(api(`/issues/${id}`), { method: 'DELETE' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
}

export async function dismissIssueLog(): Promise<void> {
  const res = await fetch(api('/issues'), { method: 'DELETE' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
}

export type ThumbView = {
  context?: string
  mode?: 'exact' | 'likely'
  fallback?: boolean
  optional?: string
  raw?: boolean
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
  if (view?.raw) {
    qs.set('raw', 'true')
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
  media = '',
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

export async function restoreModelData(): Promise<{ models: number; thumbs: number; scopesCreated: number }> {
  const res = await fetch(api('/user-models/restore-data'), { method: 'POST' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as { models: number; thumbs: number; scopesCreated: number }
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
