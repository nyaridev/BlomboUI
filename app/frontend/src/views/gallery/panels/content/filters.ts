export type GalleryMedia = 'all' | 'image' | 'video'
export type GalleryOrientation = 'all' | 'vertical' | 'square' | 'horizontal'

export type GallerySidebarId = 'home' | 'checkpoints' | 'loras' | 'wildcards' | 'libraries' | `library:${string}` | `folder:${string}`

export type GalleryFilters = {
  q: string
  tags: string[]
  scopes: string[]
  models: string[]
  loras: string[]
  wildcards: string[]
  media: GalleryMedia
  orientation: GalleryOrientation
  random: boolean
}

export const EMPTY_FILTERS: GalleryFilters = {
  q: '',
  tags: [],
  scopes: [],
  models: [],
  loras: [],
  wildcards: [],
  media: 'all',
  orientation: 'all',
  random: false,
}

export const ORIENTATION: { id: GalleryOrientation; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'vertical', label: 'Vertical' },
  { id: 'square', label: 'Square' },
  { id: 'horizontal', label: 'Horizontal' },
]

export function filtersActive(filters: GalleryFilters) {
  return Boolean(
    filters.q.trim() ||
      filters.tags.length ||
      filters.scopes.length ||
      filters.models.length ||
      filters.loras.length ||
      filters.wildcards.length ||
      filters.media !== 'all' ||
      filters.orientation !== 'all' ||
      filters.random,
  )
}

export function newestStamp(items: { created_at: string }[]) {
  return items.reduce((stamp, item) => (item.created_at > stamp ? item.created_at : stamp), '')
}
