import type { Glyph } from '@/components/composites/chrome/glyph.ts'

const API = '/api'

export function api(path: string) {
  return `${API}${path}`
}

export async function readError(res: Response): Promise<string> {
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
    sage?: boolean
    flash?: boolean
  }
}

export type ComfyStats = {
  reachable: boolean
  vram_used: number
  vram_total: number
  temp_c: number | null
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

export type KSamplerChoices = {
  samplers: string[]
  schedulers: string[]
}

export type ClipLoaderChoices = {
  types: string[]
  devices: string[]
}

export type WorkflowInfo = {
  id: string
  name: string
  category?: string
  params?: string[]
  defaults?: Record<string, unknown>
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
  apply?: string[]
  enabled?: boolean
}

export async function getTemplates(workflow: string): Promise<{ templates: TemplateInfo[]; defaultApply: string[] }> {
  const res = await fetch(api(`/templates/${encodeURIComponent(workflow)}`))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { templates: TemplateInfo[]; defaultApply?: string[]; apply?: string[] }
  return { templates: data.templates, defaultApply: data.defaultApply ?? data.apply ?? [] }
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
  const data = (await res.json()) as { defaultApply?: string[]; apply: string[] }
  return data.defaultApply ?? data.apply
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
  apply?: string[],
  enabled?: boolean,
): Promise<TemplateInfo> {
  const res = await fetch(api(`/templates/${encodeURIComponent(workflow)}/${encodeURIComponent(id)}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ params, name, icon, apply, enabled }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { template: TemplateInfo }
  return data.template
}

export async function deleteTemplate(workflow: string, id: string): Promise<void> {
  const res = await fetch(api(`/templates/${encodeURIComponent(workflow)}/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
}

export async function reorderTemplates(workflow: string, ids: string[]): Promise<TemplateInfo[]> {
  const res = await fetch(api(`/templates/${encodeURIComponent(workflow)}/order`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { templates: TemplateInfo[] }
  return data.templates
}

export async function getKSamplerChoices(): Promise<KSamplerChoices> {
  const res = await fetch(api('/comfy/ksampler'))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as KSamplerChoices
}

export async function getClipLoaderChoices(): Promise<ClipLoaderChoices> {
  const res = await fetch(api('/comfy/clip-loader'))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as ClipLoaderChoices
}

export async function getSeedvr2Models(): Promise<string[]> {
  const res = await fetch(api('/comfy/seedvr2-models'))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { models: string[] }
  return Array.isArray(data.models) ? data.models.filter((item) => typeof item === 'string') : []
}
