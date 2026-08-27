import { api, readError } from './http.ts'
import type { ModelLists, ThumbView } from './models.ts'

export type GalleryItem = {
  id: string
  created_at: string
  media_kind?: 'image' | 'video'
  asset_kind?: 'image' | 'interrupted' | 'grid'
  checkpoint?: string
  width?: number | null
  height?: number | null
}

export type GalleryPreview = {
  id: string
  media_kind: 'image' | 'video' | string
}

export type GalleryTag = {
  tag: string
  count: number
  previews: GalleryPreview[]
}

export type GalleryBrowseKind = 'checkpoints' | 'loras' | 'wildcards'

export type GalleryBrowseItem = {
  name: string
  recent: string
  works: number
  previews: GalleryPreview[]
}

export type GalleryHome = {
  recent: GalleryItem[]
  tags: GalleryTag[]
  checkpoints: GalleryBrowseItem[]
  loras: GalleryBrowseItem[]
  wildcards: GalleryBrowseItem[]
}

export type GallerySearch = {
  items: GalleryItem[]
  cursor: string
}

export type GalleryLibrary = {
  id: string
  name: string
  query: string
  scopes: string[]
  models: string[]
  loras: string[]
  wildcards: string[]
  created_at: string
  kind: 'library' | 'folder'
  parent_id: string | null
  position: number
  previews: GalleryPreview[]
}

export type Generation = GalleryItem

export type GallerySearchQuery = {
  q?: string
  tags?: string[]
  scopes?: string[]
  models?: string[]
  loras?: string[]
  wildcards?: string[]
  media?: 'all' | 'image' | 'video'
  orientation?: 'all' | 'vertical' | 'square' | 'horizontal'
  folder?: string
  cursor?: string
  limit?: number
  random?: boolean
}

function qs(params: Record<string, string | string[] | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') {
      continue
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item) {
          search.append(key, item)
        }
      }
      continue
    }
    search.set(key, value)
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

export async function listGalleryItems(): Promise<GalleryItem[]> {
  const res = await fetch(api('/gallery/items'))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { items?: GalleryItem[] }
  return data.items ?? []
}

export async function listGallerySince(createdAt: string): Promise<GalleryItem[]> {
  const res = await fetch(api(`/gallery/items/since${qs({ created_at: createdAt })}`))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { items?: GalleryItem[] }
  return data.items ?? []
}

export async function syncGallery(): Promise<void> {
  const res = await fetch(api('/gallery/sync'), { method: 'POST' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
}

export async function searchGallery(query: GallerySearchQuery): Promise<GallerySearch> {
  const res = await fetch(
    api(
      `/gallery/search${qs({
        q: query.q,
        tag: query.tags,
        scope: query.scopes,
        model: query.models,
        lora: query.loras,
        wildcard: query.wildcards,
        media: query.media === 'all' ? undefined : query.media,
        orientation: query.orientation === 'all' ? undefined : query.orientation,
        folder: query.folder,
        cursor: query.cursor,
        limit: query.limit != null ? String(query.limit) : undefined,
        random: query.random ? '1' : undefined,
      })}`,
    ),
  )
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as GallerySearch
  return { items: data.items ?? [], cursor: data.cursor ?? '' }
}

export async function getGalleryHome(): Promise<GalleryHome> {
  const res = await fetch(api('/gallery/home'))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as GalleryHome
  return {
    recent: data.recent ?? [],
    tags: (data.tags ?? []).map((item) => ({ ...item, previews: item.previews ?? [] })),
    checkpoints: data.checkpoints ?? [],
    loras: data.loras ?? [],
    wildcards: data.wildcards ?? [],
  }
}

export async function browseGallery(
  kind: GalleryBrowseKind,
  sort: 'recent' | 'works' = 'recent',
  dir: 'asc' | 'desc' = 'desc',
): Promise<GalleryBrowseItem[]> {
  const res = await fetch(api(`/gallery/browse/${kind}${qs({ sort, dir })}`))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { items?: GalleryBrowseItem[] }
  return data.items ?? []
}

export async function listGalleryLibraries(): Promise<GalleryLibrary[]> {
  const res = await fetch(api('/gallery/libraries'))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { items?: GalleryLibrary[] }
  return (data.items ?? []).map((item) => ({
    ...item,
    scopes: item.scopes ?? [],
    models: item.models ?? [],
    loras: item.loras ?? [],
    wildcards: item.wildcards ?? [],
    kind: item.kind === 'folder' ? 'folder' : 'library',
    parent_id: item.parent_id ?? null,
    position: item.position ?? 0,
    previews: item.previews ?? [],
  }))
}

export type GalleryLibraryWrite = Pick<GalleryLibrary, 'name' | 'query' | 'scopes' | 'models' | 'loras' | 'wildcards'> & {
  kind?: GalleryLibrary['kind']
  parent_id?: string | null
}

export async function createGalleryLibrary(body: GalleryLibraryWrite): Promise<GalleryLibrary> {
  const res = await fetch(api('/gallery/libraries'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as GalleryLibrary
}

export async function updateGalleryLibrary(id: string, body: GalleryLibraryWrite): Promise<GalleryLibrary> {
  const res = await fetch(api(`/gallery/libraries/${encodeURIComponent(id)}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as GalleryLibrary
}

export async function orderGalleryLibraries(parentId: string | null, ids: string[]): Promise<GalleryLibrary[]> {
  const res = await fetch(api('/gallery/libraries/order'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parent_id: parentId, ids }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { items?: GalleryLibrary[] }
  return (data.items ?? []).map((item) => ({
    ...item,
    scopes: item.scopes ?? [],
    models: item.models ?? [],
    loras: item.loras ?? [],
    wildcards: item.wildcards ?? [],
    kind: item.kind === 'folder' ? 'folder' : 'library',
    parent_id: item.parent_id ?? null,
    position: item.position ?? 0,
    previews: item.previews ?? [],
  }))
}

export async function deleteGalleryLibrary(id: string): Promise<void> {
  const res = await fetch(api(`/gallery/libraries/${encodeURIComponent(id)}`), { method: 'DELETE' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
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
