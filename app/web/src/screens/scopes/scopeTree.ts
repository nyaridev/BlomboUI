import { type ThumbScope } from '@/lib/api.ts'
import { GLOBAL_SCOPE } from '@/lib/thumbView.ts'

export const UNGROUPED = 'Ungrouped'

export function nameKey(name: string) {
  return name.trim().toLowerCase()
}

export function groupValue(title: string) {
  return title === UNGROUPED ? '' : title
}

export function orderByIds<T extends { id: string }>(items: T[], order: string[] = []) {
  const rank = new Map((order || []).map((id, index) => [id, index]))
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ai = rank.get(a.item.id)
      const bi = rank.get(b.item.id)
      if (ai == null && bi == null) {
        return a.index - b.index
      }
      if (ai == null) {
        return 1
      }
      if (bi == null) {
        return -1
      }
      return ai - bi
    })
    .map((row) => row.item)
}

export function groupedScopes(items: ThumbScope[], groupOrder: string[], itemOrder: string[], emptyUngrouped = false) {
  const global = items.filter((item) => item.id === GLOBAL_SCOPE)
  const rest = orderByIds(
    items.filter((item) => item.id !== GLOBAL_SCOPE),
    itemOrder,
  )
  const buckets = new Map<string, ThumbScope[]>()
  const labels = new Map<string, string>()
  const ungrouped: ThumbScope[] = []
  for (const item of rest) {
    const group = item.group.trim()
    if (!group) {
      ungrouped.push(item)
      continue
    }
    const key = nameKey(group)
    const list = buckets.get(key) || []
    list.push(item)
    buckets.set(key, list)
    if (!labels.has(key)) {
      labels.set(key, group)
    }
  }
  const sections: { title: string; items: ThumbScope[] }[] = []
  if (global.length) {
    sections.push({ title: '', items: global })
  }
  const used = new Set<string>()
  for (const name of groupOrder) {
    const text = name.trim()
    if (!text) {
      continue
    }
    const key = nameKey(text)
    if (used.has(key)) {
      continue
    }
    used.add(key)
    const rows = buckets.get(key) || []
    if (rows.length) {
      sections.push({ title: labels.get(key) || text, items: rows })
    }
  }
  const extra = [...buckets.keys()]
    .filter((key) => !used.has(key))
    .sort((a, b) => a.localeCompare(b))
  for (const key of extra) {
    sections.push({ title: labels.get(key) || key, items: buckets.get(key) || [] })
  }
  if (ungrouped.length || emptyUngrouped) {
    sections.push({ title: UNGROUPED, items: ungrouped })
  }
  return sections
}

export function placeScope(
  items: ThumbScope[],
  groupOrder: string[],
  itemOrder: string[],
  id: string,
  title: string,
  index: number,
) {
  const rest = items.filter((item) => item.id !== id)
  const sections = groupedScopes(rest, groupOrder, itemOrder, true)
  const ids: string[] = []
  let placed = false
  const want = title === UNGROUPED ? UNGROUPED : nameKey(title)
  for (const section of sections) {
    if (!section.title) {
      continue
    }
    const list = section.items.map((item) => item.id)
    const key = section.title === UNGROUPED ? UNGROUPED : nameKey(section.title)
    if (key === want) {
      list.splice(Math.max(0, Math.min(index, list.length)), 0, id)
      placed = true
    }
    ids.push(...list)
  }
  if (!placed) {
    ids.push(id)
  }
  return ids
}
