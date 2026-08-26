import { api, readError } from './http.ts'

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
  type?: string
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
  if (res.status === 404 || !res.ok) {
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
  page?: number
  limit: number
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
    page: String(params.page ?? 1),
    limit: String(params.limit),
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
}): Promise<
  | { queued: true; key: string }
  | { queued?: false; modelId: number; versionId: number; kind: string; paths: string[]; creator: string; creatorAlias: string }
> {
  const res = await fetch(api('/civitai/download'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as
    | { queued: true; key: string }
    | { queued?: false; modelId: number; versionId: number; kind: string; paths: string[]; creator: string; creatorAlias: string }
}

export async function fetchCivitaiImage(url: string): Promise<File> {
  const res = await fetch(api(`/civitai/image?url=${encodeURIComponent(url)}`))
  if (!res.ok) {
    throw new Error(`civitai image ${res.status}`)
  }
  const blob = await res.blob()
  const type = blob.type || 'image/jpeg'
  const ext =
    type.includes('mp4') ? 'mp4'
    : type.includes('webm') ? 'webm'
    : type.includes('gif') ? 'gif'
    : type === 'image/png' ? 'png'
    : type === 'image/webp' ? 'webp'
    : 'jpg'
  return new File([blob], `preview.${ext}`, { type })
}
