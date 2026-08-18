export type Health = {
  ok: boolean
  api: string
  version: string
  comfy: {
    reachable: boolean
    mode: string | null
    path: string | null
  }
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
  created_at: string
  started_at: string | null
  finished_at: string | null
  progress: { value: number; max: number } | null
  job_progress: { value: number; max: number } | null
  has_preview: boolean
  preview_steps: number[]
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
  sampler: string
  scheduler: string
  workflow: string
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

export type ModelLists = {
  checkpoints: string[]
  loras: string[]
  vae: string[]
  controlnet: string[]
  embeddings: string[]
  wildcards: string[]
}

export async function getModels(): Promise<ModelLists> {
  const res = await fetch('/models')
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as ModelLists
}

export async function refreshModels(): Promise<ModelLists> {
  const res = await fetch('/models/refresh', { method: 'POST' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as ModelLists
}

export async function readPngInfo(file: File): Promise<string> {
  const res = await fetch('/pnginfo', {
    method: 'POST',
    headers: { 'X-Filename': file.name },
    body: file,
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { text?: string }
  return data.text || 'No generation metadata found.'
}

export async function getHealth(): Promise<Health> {
  const res = await fetch('/health')
  if (!res.ok) {
    throw new Error(`health ${res.status}`)
  }
  return (await res.json()) as Health
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

export function jobGridUrl(jobId: string): string {
  return `/jobs/${jobId}/grid`
}

export function jobPreviewUrl(jobId: string, tick: number): string {
  return `/jobs/${jobId}/preview?t=${tick}`
}

export function jobStepPreviewUrl(jobId: string, step: number): string {
  return `/jobs/${jobId}/previews/${step}`
}
