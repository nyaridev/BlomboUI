export type GalleryMedia = 'all' | 'image' | 'video'

export type GalleryNavId = 'home' | 'checkpoints' | 'loras' | 'wildcards' | 'libraries' | `library:${string}`

export type GalleryFilters = {
  q: string
  tags: string[]
  scopes: string[]
  models: string[]
  loras: string[]
  wildcards: string[]
  media: GalleryMedia
}

export const EMPTY_FILTERS: GalleryFilters = {
  q: '',
  tags: [],
  scopes: [],
  models: [],
  loras: [],
  wildcards: [],
  media: 'all',
}

export function filtersActive(filters: GalleryFilters) {
  return Boolean(
    filters.q.trim() ||
      filters.tags.length ||
      filters.scopes.length ||
      filters.models.length ||
      filters.loras.length ||
      filters.wildcards.length ||
      filters.media !== 'all',
  )
}

export function newestStamp(items: { created_at: string }[]) {
  return items.reduce((stamp, item) => (item.created_at > stamp ? item.created_at : stamp), '')
}
