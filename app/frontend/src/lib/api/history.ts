import { api, readError } from './http.ts'

export type BrowseHistoryItem = {
  id: number
  modelId: number
  name: string
  type: string
  creator: string
  imageUrl: string
  site: string
  searchText: string
  viewedAt: number
}

function asItem(row: Partial<BrowseHistoryItem>): BrowseHistoryItem {
  return {
    id: Number(row.id) || 0,
    modelId: Number(row.modelId) || 0,
    name: row.name || '',
    type: row.type || '',
    creator: row.creator || '',
    imageUrl: row.imageUrl || '',
    site: row.site || '',
    searchText: row.searchText || '',
    viewedAt: Number(row.viewedAt) || 0,
  }
}

export async function listBrowseHistory(): Promise<BrowseHistoryItem[]> {
  const res = await fetch(api('/history/browse'))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { items?: Partial<BrowseHistoryItem>[] }
  return Array.isArray(data.items) ? data.items.map(asItem) : []
}

export async function recordBrowseHistory(body: {
  modelId: number
  name: string
  type?: string
  creator?: string
  imageUrl?: string
  site?: string
}): Promise<BrowseHistoryItem | null> {
  const res = await fetch(api('/history/browse'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    return null
  }
  return asItem((await res.json()) as Partial<BrowseHistoryItem>)
}

export async function clearBrowseHistory(): Promise<number> {
  const res = await fetch(api('/history/browse'), { method: 'DELETE' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { count?: number }
  return data.count ?? 0
}

export async function removeBrowseHistory(id: number): Promise<void> {
  const res = await fetch(api(`/history/browse/${id}`), { method: 'DELETE' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
}

export function browseThumbUrl(
  id: number,
  megapixels: number,
  imageFormat = 'jpg',
  videoFormat = 'webp',
  quality = 85,
): string {
  const mp = Math.round(megapixels * 100)
  const img = encodeURIComponent(imageFormat)
  const vid = encodeURIComponent(videoFormat)
  return api(`/history/browse/${id}/thumb?mp=${mp}&img=${img}&vid=${vid}&q=${quality}`)
}
