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
  const order = childrenOf(items, parentId).map((item) => item.id)
  const siblings = order.filter((id) => id !== dragId)
  let target = beforeId
  while (target === dragId) {
    const index = order.indexOf(target)
    target = index >= 0 && index + 1 < order.length ? order[index + 1] : null
  }
  if (!target) {
    return [...siblings, dragId]
  }
  const index = siblings.indexOf(target)
  if (index < 0) {
    return [...siblings, dragId]
  }
  return [...siblings.slice(0, index), dragId, ...siblings.slice(index)]
}

export function orderChanged(items: GalleryLibrary[], parentId: string | null, dragId: string, ids: string[]) {
  const item = items.find((row) => row.id === dragId)
  if ((item?.parent_id ?? null) !== parentId) {
    return true
  }
  const current = childrenOf(items, parentId).map((row) => row.id)
  return current.length !== ids.length || current.some((id, index) => id !== ids[index])
}

export type LibraryDrop = { parentId: string | null; beforeId: string | null }
export type LibraryDropKind = 'before' | 'after' | 'into'
export type LibraryDropAxis = 'x' | 'y'

export function dropOnItem(
  item: GalleryLibrary,
  client: number,
  origin: number,
  size: number,
  nextId: string | null,
  axis: LibraryDropAxis = 'y',
): LibraryDrop {
  const t = size > 0 ? (client - origin) / size : 0.5
  const folder = isFolder(item)
  const lo = axis === 'x' ? 0.28 : 0.3
  const hi = axis === 'x' ? 0.72 : 0.7
  if (folder && t >= lo && t <= hi) {
    return { parentId: item.id, beforeId: null }
  }
  if (t < 0.5) {
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

export function createDragSession() {
  let moved = false
  let unlock = 0
  return {
    start() {
      moved = false
      if (unlock) {
        window.clearTimeout(unlock)
        unlock = 0
      }
    },
    mark() {
      moved = true
    },
    end() {
      if (!moved) {
        return
      }
      if (unlock) {
        window.clearTimeout(unlock)
      }
      unlock = window.setTimeout(() => {
        moved = false
        unlock = 0
      }, 80)
    },
    clickLocked() {
      if (!moved) {
        return false
      }
      moved = false
      if (unlock) {
        window.clearTimeout(unlock)
        unlock = 0
      }
      return true
    },
  }
}
