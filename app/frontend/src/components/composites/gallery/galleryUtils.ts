import type { GallerySortDir, GallerySortKey } from '@/components/composites/gallery/GalleryToolbar.tsx'
import { LOCAL_ID } from '@/components/controls/folder-list/FolderList.tsx'
import { modelLabel } from '@/stores/modelsStore.ts'
import { identToDisplay, treeDisplayPath } from '@/lib/gallery/tree.ts'
import type { ModelEntry, ModelLists } from '@/lib/api.ts'

export const OTHER_KIND_IDS = ['vae', 'text_encoders'] as const
export type OtherKindId = (typeof OTHER_KIND_IDS)[number]

const OTHER_KIND_LABELS: Record<OtherKindId, string> = {
  vae: 'VAE',
  text_encoders: 'Text encoder',
}

export function isOtherKind(kind: string): kind is OtherKindId {
  return kind === 'vae' || kind === 'text_encoders'
}

export function otherKindLabel(kind: string) {
  return isOtherKind(kind) ? OTHER_KIND_LABELS[kind] : ''
}

export const TREE_REM = 18
export const TREE_MIN_REM = 12
export const TILE_COL_REM = 16
export const TILE_ROW_REM = 24
export const GALLERY_ROWS = 2
export const TILE_GAP_REM = 1
export const TILE_PAD_REM = 1
export const TILE_CELL_PAD_REM = 0.75

export function galleryBodyRem(tileH: number) {
  return TILE_PAD_REM + GALLERY_ROWS * (tileH + TILE_CELL_PAD_REM) + (GALLERY_ROWS - 1) * TILE_GAP_REM
}

export type GalleryChrome = {
  query: string
  showTree: boolean
  treeWidth: number
  openDirs: string[]
  treeScroll: number
  tileScroll: number
}

export const chrome = new Map<string, GalleryChrome>()
export const EMPTY_TYPES: string[] = []

export function remPx() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

export function remapPrefix(path: string, from: string, to: string) {
  if (path === from) {
    return to
  }
  if (from && path.startsWith(`${from}/`)) {
    return to + path.slice(from.length)
  }
  return path
}

export function fileName(path: string) {
  return modelLabel(path.split(/[\\/]/).pop() || path)
}

export function filePath(item: ModelEntry) {
  return item.source || item.path.split('#')[0] || item.path
}

export function isFileTile(item: ModelEntry) {
  const ident = item.path.replace(/\\/g, '/')
  const hash = ident.indexOf('#')
  if (hash < 0) {
    return true
  }
  const tag = ident.slice(hash + 1)
  const source = filePath(item).replace(/\\/g, '/')
  const cut = source.lastIndexOf('/')
  const folder = cut >= 0 ? source.slice(0, cut + 1) : ''
  const rest = folder && tag.startsWith(folder) ? tag.slice(folder.length) : tag
  return Boolean(rest) && !rest.includes('/')
}

export function coversPath(path: string, ident: string) {
  return path === ident || path.startsWith(`${ident}/`) || path.startsWith(`${ident}#`)
}

export function tileName(item: ModelEntry) {
  return item.label || item.tag || fileName(item.path)
}

export function matchesQuery(item: ModelEntry, query: string, extraNames: string[]) {
  const q = query.trim().toLowerCase()
  if (!q) {
    return true
  }
  const tag = treeDisplayPath(item, extraNames).toLowerCase()
  const path = item.path.replace(/\\/g, '/').toLowerCase()
  const source = identToDisplay(filePath(item), extraNames).toLowerCase()
  if (
    tag === q ||
    tag.startsWith(`${q}/`) ||
    path === q ||
    path.startsWith(`${q}/`) ||
    source === q ||
    source.startsWith(`${q}/`)
  ) {
    return true
  }
  return path.includes(q) || tag.includes(q) || fileName(item.path).toLowerCase().includes(q) || (item.label || '').toLowerCase().includes(q)
}

function sortName(item: ModelEntry) {
  return fileName(filePath(item))
}

export function sortItems(items: ModelEntry[], key: GallerySortKey, dir: GallerySortDir) {
  const next = [...items]
  next.sort((a, b) => {
    if (key === 'added' || key === 'edited') {
      const delta = a[key] - b[key]
      if (delta !== 0) {
        return delta
      }
    }
    const av = key === 'path' ? a.path : sortName(a)
    const bv = key === 'path' ? b.path : sortName(b)
    const byName = av.localeCompare(bv, undefined, { sensitivity: 'base' })
    if (byName !== 0) {
      return byName
    }
    return a.path.localeCompare(b.path, undefined, { sensitivity: 'base' })
  })
  if (dir === 'desc') {
    next.reverse()
  }
  return next
}

export function matchesTypes(item: ModelEntry, types: string[], kind?: keyof ModelLists) {
  if (!types.length) {
    return true
  }
  const kindFilters = types.filter(isOtherKind)
  const archFilters = types.filter((type) => !isOtherKind(type))
  const kindOk = !kindFilters.length || kind == null || !isOtherKind(kind) || kindFilters.includes(kind)
  const archOk = !archFilters.length || (item.types || []).some((type) => archFilters.includes(type))
  return kindOk && archOk
}

export { LOCAL_ID }
