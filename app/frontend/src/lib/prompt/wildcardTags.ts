import type { ModelEntry } from '@/lib/api.ts'

const TAG = /__(\S+?)__/gi

export function wildcardTag(item: Pick<ModelEntry, 'path' | 'label' | 'tag'>) {
  if (item.tag) {
    return wrap(item.tag)
  }
  const posix = item.path.replace(/\\/g, '/')
  const hash = posix.indexOf('#')
  if (hash >= 0) {
    return wrap(posix.slice(hash + 1))
  }
  const noExt = posix.replace(/\.[^/.]+$/, '')
  return wrap(item.label || noExt)
}

export function toggleWildcard(prompt: string, item: Pick<ModelEntry, 'path' | 'label' | 'tag'>) {
  const tag = wildcardTag(item)
  if (hasTag(prompt, tag)) {
    return removeTag(prompt, tag)
  }
  return addTag(prompt, tag)
}

function wrap(name: string) {
  return `__${name}__`
}

export function parseWildcardTags(prompt: string) {
  const out: { name: string; tag: string; start: number; end: number }[] = []
  const re = new RegExp(TAG.source, 'gi')
  let match: RegExpExecArray | null
  while ((match = re.exec(prompt))) {
    out.push({
      name: match[1],
      tag: match[0],
      start: match.index,
      end: match.index + match[0].length,
    })
  }
  return out
}

export function wildcardMatches(item: Pick<ModelEntry, 'path' | 'label' | 'tag'>, tagName: string) {
  return wildcardTag(item).toLowerCase() === wrap(tagName).toLowerCase()
}

const wildcardIndexCache = new WeakMap<object, Map<string, Pick<ModelEntry, 'path' | 'label' | 'tag'>>>()

function wildcardIndex<T extends Pick<ModelEntry, 'path' | 'label' | 'tag'>>(items: readonly T[]) {
  const cached = wildcardIndexCache.get(items)
  if (cached) {
    return cached as Map<string, T>
  }
  const map = new Map<string, T>()
  for (const item of items) {
    const key = wildcardTag(item).toLowerCase()
    if (!map.has(key)) {
      map.set(key, item)
    }
  }
  wildcardIndexCache.set(items, map)
  return map
}

export function findWildcardByTag<T extends Pick<ModelEntry, 'path' | 'label' | 'tag'>>(items: readonly T[], tagName: string) {
  if (!tagName) {
    return undefined
  }
  return wildcardIndex(items).get(wrap(tagName).toLowerCase())
}

export function replaceWildcardAt(prompt: string, index: number, item: Pick<ModelEntry, 'path' | 'label' | 'tag'>) {
  const hit = parseWildcardTags(prompt)[index]
  const tag = wildcardTag(item)
  if (!hit) {
    return toggleWildcard(prompt, item)
  }
  if (hit.tag.toLowerCase() === tag.toLowerCase()) {
    return prompt
  }
  return tidyPrompt(prompt.slice(0, hit.start) + tag + prompt.slice(hit.end))
}

function tidyPrompt(text: string) {
  return text
    .replace(/,\s*,+/g, ',')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ \t,]+/, '')
    .replace(/[ \t,]+$/, '')
}

export function removeWildcardAt(prompt: string, index: number) {
  const hit = parseWildcardTags(prompt)[index]
  if (!hit) {
    return prompt
  }
  return tidyPrompt(prompt.slice(0, hit.start) + prompt.slice(hit.end))
}

export function reorderWildcardTags(prompt: string, order: number[]): string {
  const hits = parseWildcardTags(prompt)
  if (!hits.length || order.length !== hits.length) {
    return prompt
  }
  let out = prompt
  for (let index = hits.length - 1; index >= 0; index -= 1) {
    const next = hits[order[index]]
    const current = hits[index]
    if (!next || next.tag === current.tag) {
      continue
    }
    out = out.slice(0, current.start) + next.tag + out.slice(current.end)
  }
  return out
}

export function moveWildcardAt(prompt: string, fromIndex: number, toIndex: number, before = true): string {
  const hits = parseWildcardTags(prompt)
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= hits.length ||
    toIndex >= hits.length ||
    fromIndex === toIndex
  ) {
    return prompt
  }
  const order = hits.map((_, index) => index)
  const [moved] = order.splice(fromIndex, 1)
  const insertAt = order.indexOf(toIndex) + (before ? 0 : 1)
  if (insertAt === fromIndex) {
    return prompt
  }
  order.splice(insertAt, 0, moved)
  return reorderWildcardTags(prompt, order)
}

function hasTag(prompt: string, tag: string) {
  const want = tag.toLowerCase()
  const re = new RegExp(TAG.source, 'gi')
  let match: RegExpExecArray | null
  while ((match = re.exec(prompt))) {
    if (match[0].toLowerCase() === want) {
      return true
    }
  }
  return false
}

function addTag(prompt: string, tag: string) {
  const trimmed = prompt.replace(/[ \t,]+$/, '')
  if (!trimmed) {
    return tag
  }
  if (trimmed.endsWith(',')) {
    return `${trimmed} ${tag}`
  }
  return `${trimmed}, ${tag}`
}

function removeTag(prompt: string, tag: string) {
  return prompt
    .replace(new RegExp(escapeRe(tag), 'gi'), '')
    .replace(/,\s*,+/g, ',')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ \t,]+/, '')
    .replace(/[ \t,]+$/, '')
}

function escapeRe(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
