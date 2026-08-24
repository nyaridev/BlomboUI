import { api, readError } from './http.ts'
import type { ModelLists, ThumbView } from './models.ts'

export type GalleryItem = {
  id: string
  created_at: string
  asset_kind?: 'image' | 'interrupted' | 'grid'
}

export type Generation = GalleryItem

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
