import { api, readError } from './http.ts'

export type DownloadItem = {
  id: number
  source: string
  modelId: number
  versionId: number
  fileId: number | null
  name: string
  versionName: string
  kind: string
  creator: string
  fileName: string
  sizeBytes: number
  baseModel: string
  tags: string[]
  trainedWords: string[]
  description: string
  searchText: string
  paths: string[]
  imageUrl: string
  site: string
  status: 'done' | 'failed'
  error: string
  createdAt: number
}

export type ActiveDownload = {
  key: string
  modelId: number
  versionId: number
  fileId: number | null
  name: string
  versionName: string
  kind: string
  creator: string
  fileName: string
  sizeBytes: number
  bytesDone: number
  speedBps: number
  startedAt: number
  imageUrl: string
  site: string
  baseModel: string
  tags: string[]
  trainedWords: string[]
  description: string
  searchText: string
  historyId?: number | null
}

export type QueuedDownload = {
  key: string
  historyId?: number | null
  queuedAt: number
  modelId: number
  versionId: number
  fileId: number | null
  name: string
  versionName: string
  kind: string
  creator: string
  fileName: string
  sizeBytes: number
  imageUrl: string
  site: string
  baseModel: string
  tags: string[]
  trainedWords: string[]
  description: string
  searchText: string
}

function asStrings(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map((item) => String(item || '')).filter(Boolean) : []
}

function asItem(row: Partial<DownloadItem>): DownloadItem {
  return {
    id: Number(row.id) || 0,
    source: row.source || '',
    modelId: Number(row.modelId) || 0,
    versionId: Number(row.versionId) || 0,
    fileId: row.fileId ?? null,
    name: row.name || '',
    versionName: row.versionName || '',
    kind: row.kind || '',
    creator: row.creator || '',
    fileName: row.fileName || '',
    sizeBytes: Number(row.sizeBytes) || 0,
    baseModel: row.baseModel || '',
    tags: asStrings(row.tags),
    trainedWords: asStrings(row.trainedWords),
    description: row.description || '',
    searchText: row.searchText || '',
    paths: Array.isArray(row.paths) ? row.paths : [],
    imageUrl: row.imageUrl || '',
    site: row.site || '',
    status: row.status === 'failed' ? 'failed' : 'done',
    error: row.error || '',
    createdAt: Number(row.createdAt) || 0,
  }
}

function asActive(row: Partial<ActiveDownload>): ActiveDownload {
  return {
    key: row.key || '',
    modelId: Number(row.modelId) || 0,
    versionId: Number(row.versionId) || 0,
    fileId: row.fileId ?? null,
    name: row.name || '',
    versionName: row.versionName || '',
    kind: row.kind || '',
    creator: row.creator || '',
    fileName: row.fileName || '',
    sizeBytes: Number(row.sizeBytes) || 0,
    bytesDone: Number(row.bytesDone) || 0,
    speedBps: Number(row.speedBps) || 0,
    startedAt: Number(row.startedAt) || 0,
    imageUrl: row.imageUrl || '',
    site: row.site || '',
    baseModel: row.baseModel || '',
    tags: asStrings(row.tags),
    trainedWords: asStrings(row.trainedWords),
    description: row.description || '',
    searchText: row.searchText || '',
    historyId: row.historyId ?? null,
  }
}

function asQueued(row: Partial<QueuedDownload>): QueuedDownload {
  return {
    key: row.key || '',
    historyId: row.historyId ?? null,
    queuedAt: Number(row.queuedAt) || 0,
    modelId: Number(row.modelId) || 0,
    versionId: Number(row.versionId) || 0,
    fileId: row.fileId ?? null,
    name: row.name || '',
    versionName: row.versionName || '',
    kind: row.kind || '',
    creator: row.creator || '',
    fileName: row.fileName || '',
    sizeBytes: Number(row.sizeBytes) || 0,
    imageUrl: row.imageUrl || '',
    site: row.site || '',
    baseModel: row.baseModel || '',
    tags: asStrings(row.tags),
    trainedWords: asStrings(row.trainedWords),
    description: row.description || '',
    searchText: row.searchText || '',
  }
}

export async function listDownloads(): Promise<{
  items: DownloadItem[]
  active: ActiveDownload[]
  queued: QueuedDownload[]
}> {
  const res = await fetch(api('/downloads'))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as {
    items?: Partial<DownloadItem>[]
    active?: Partial<ActiveDownload>[]
    queued?: Partial<QueuedDownload>[]
  }
  return {
    items: Array.isArray(data.items) ? data.items.map(asItem) : [],
    active: Array.isArray(data.active) ? data.active.map(asActive) : [],
    queued: Array.isArray(data.queued) ? data.queued.map(asQueued) : [],
  }
}

export async function clearDownloads(): Promise<number> {
  const res = await fetch(api('/downloads'), { method: 'DELETE' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { count?: number }
  return data.count ?? 0
}

export async function removeDownload(id: number): Promise<void> {
  const res = await fetch(api(`/downloads/${id}`), { method: 'DELETE' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
}

export async function retryDownload(id: number): Promise<{ queued?: boolean; key?: string }> {
  const res = await fetch(api(`/downloads/${id}/retry`), { method: 'POST' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as { queued?: boolean; key?: string }
}

export async function revealDownload(id: number): Promise<void> {
  const res = await fetch(api(`/downloads/${id}/open`), { method: 'POST' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
}

export function downloadThumbUrl(
  id: number,
  megapixels: number,
  imageFormat = 'jpg',
  videoFormat = 'webp',
  quality = 85,
): string {
  const mp = Math.round(megapixels * 100)
  const img = encodeURIComponent(imageFormat)
  const vid = encodeURIComponent(videoFormat)
  return api(`/downloads/${id}/thumb?mp=${mp}&img=${img}&vid=${vid}&q=${quality}`)
}
