import type { GalleryLibrary } from '@/lib/api/gallery.ts'

export function isFolder(item: GalleryLibrary) {
  return item.kind === 'folder'
}

export function childrenOf(items: GalleryLibrary[], parentId: string | null) {
  return items
    .filter((item) => (item.parent_id ?? null) === parentId)
    .slice()
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

export function descendantIds(items: GalleryLibrary[], ident: string) {
  const byParent = new Map<string | null, GalleryLibrary[]>()
  for (const item of items) {
    const key = item.parent_id ?? null
    const list = byParent.get(key)
    if (list) {
      list.push(item)
    } else {
      byParent.set(key, [item])
    }
  }
  const out: string[] = []
  function walk(parent: string) {
    for (const child of byParent.get(parent) ?? []) {
      out.push(child.id)
      if (isFolder(child)) {
        walk(child.id)
      }
    }
  }
  walk(ident)
  return out
}

export function ancestorsOf(items: GalleryLibrary[], ident: string) {
  const byId = new Map(items.map((item) => [item.id, item]))
  const out: GalleryLibrary[] = []
  const seen = new Set<string>()
  let current = byId.get(ident)
  while (current?.parent_id && !seen.has(current.id)) {
    seen.add(current.id)
    const parent = byId.get(current.parent_id)
    if (!parent) {
      break
    }
    out.unshift(parent)
    current = parent
  }
  return out
}

export function canMove(items: GalleryLibrary[], dragId: string, parentId: string | null) {
  if (dragId === parentId) {
    return false
  }
  if (!parentId) {
    return true
  }
  const parent = items.find((item) => item.id === parentId)
  if (!parent || !isFolder(parent)) {
    return false
  }
  return !descendantIds(items, dragId).includes(parentId)
}

export function placeIds(items: GalleryLibrary[], parentId: string | null, dragId: string, beforeId: string | null) {
  const siblings = childrenOf(items, parentId)
    .map((item) => item.id)
    .filter((id) => id !== dragId)
  if (!beforeId) {
    return [...siblings, dragId]
  }
  const index = siblings.indexOf(beforeId)
  if (index < 0) {
    return [...siblings, dragId]
  }
  return [...siblings.slice(0, index), dragId, ...siblings.slice(index)]
}

export type LibraryDrop = { parentId: string | null; beforeId: string | null }
export type LibraryDropKind = 'before' | 'after' | 'into'

export function dropOnItem(item: GalleryLibrary, clientY: number, top: number, height: number, nextId: string | null): LibraryDrop {
  const y = clientY - top
  const folder = isFolder(item)
  if (folder && y >= height * 0.35 && y <= height * 0.85) {
    return { parentId: item.id, beforeId: null }
  }
  if (y < height / 2) {
    return { parentId: item.parent_id ?? null, beforeId: item.id }
  }
  return { parentId: item.parent_id ?? null, beforeId: nextId }
}

export function dropKind(item: GalleryLibrary, dest: LibraryDrop): LibraryDropKind | null {
  if (dest.parentId === item.id) {
    return 'into'
  }
  if (dest.parentId !== (item.parent_id ?? null)) {
    return null
  }
  return dest.beforeId === item.id ? 'before' : 'after'
}
