import type { ModelEntry } from '@/lib/api.ts'
import { formatLoraStrength, loraStem } from '@/lib/prompt/loraTags.ts'
import { wildcardTag } from '@/lib/prompt/wildcardTags.ts'

export type PromptMode = 'tag' | 'lora' | 'wildcard'

export type PromptToken = {
  start: number
  end: number
  caret: number
  query: string
  mode: PromptMode
}

export type SuggestHit = {
  kind: PromptMode
  tag: string
  posts: number
  count: number
  favorite: boolean
  alias?: string
  extra?: string
  negative?: string
  strength?: number
  partial?: boolean
  path?: string
  thumb?: number
}

const LIMIT = 80

const MIRROR_PROPS = [
  'boxSizing',
  'width',
  'font',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'textTransform',
  'wordSpacing',
  'textIndent',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'lineHeight',
  'textAlign',
] as const

export function tokenAt(text: string, caret: number): PromptToken | null {
  const left = text.slice(0, caret)
  const cut = Math.max(left.lastIndexOf(','), left.lastIndexOf('\n'))
  let start = cut + 1
  while (start < caret && (text[start] === ' ' || text[start] === '\t')) {
    start += 1
  }
  let end = caret
  while (end < text.length && text[end] !== ',' && text[end] !== '\n') {
    end += 1
  }
  const query = text.slice(start, caret)
  if (!query) {
    return null
  }
  if (query.startsWith('<')) {
    const rest = query.slice(1)
    const inner = rest.match(/^lora:(.*)$/i)?.[1] ?? rest
    if (inner.includes('>') || inner.includes(':')) {
      return null
    }
    return { start, end, caret, query, mode: 'lora' }
  }
  if (query.startsWith('__')) {
    const inner = query.slice(2)
    if (inner.includes('__')) {
      return null
    }
    return { start, end, caret, query, mode: 'wildcard' }
  }
  return { start, end, caret, query, mode: 'tag' }
}

export function formatInsertTag(tag: string) {
  return tag
    .replaceAll('_', ' ')
    .replace(/\\+([()])/g, '\\$1')
    .replace(/(?<!\\)([()])/g, '\\$1')
}

export function completeInsert(text: string, start: number, end: number, insert: string, trailing = true) {
  const rest = text.slice(end)
  const hasSep = rest.startsWith(',') || rest.startsWith('\n')
  const chunk = trailing && !hasSep && !insert.endsWith(', ') ? `${insert}, ` : insert
  return {
    text: `${text.slice(0, start)}${chunk}${rest}`,
    caret: start + chunk.length,
  }
}

export function completeToken(text: string, start: number, end: number, tag: string) {
  return completeInsert(text, start, end, formatInsertTag(tag))
}

export function loraInsert(item: SuggestHit, triggers = true) {
  const name = item.tag.replace(/^<lora:/i, '').replace(/>$/, '')
  const strength = formatLoraStrength(item.strength ?? 1)
  let insert = `<lora:${name}:${strength}>`
  if (triggers && item.extra?.trim()) {
    insert += `, ${item.extra.trim()}`
  }
  return insert
}

function wildcardName(item: ModelEntry) {
  const tag = wildcardTag(item)
  return tag.startsWith('__') && tag.endsWith('__') ? tag.slice(2, -2) : tag
}

function wildcardRank(name: string, needle: string) {
  if (!needle) {
    return 1
  }
  const lower = name.toLowerCase()
  if (lower.startsWith(needle) || needle.startsWith(lower)) {
    return 0
  }
  if (lower.split('/').some((part) => part.startsWith(needle))) {
    return 1
  }
  return 3
}

function wildcardPaths(items: ModelEntry[]) {
  const map = new Map<string, { name: string; dir: boolean; path: string; thumb: number }>()
  for (const item of items) {
    const name = wildcardName(item).replaceAll('\\', '/')
    if (!name) {
      continue
    }
    const key = name.toLowerCase()
    const prev = map.get(key)
    const thumb = Number(item.thumb) || 0
    const path = item.path
    if (!prev) {
      map.set(key, { name, dir: Boolean(item.dir), path, thumb })
      continue
    }
    map.set(key, {
      name: prev.name,
      dir: Boolean(prev.dir || item.dir),
      path: !prev.thumb && thumb ? path : prev.path,
      thumb: prev.thumb || thumb,
    })
  }
  for (const key of [...map.keys()]) {
    const row = map.get(key)
    if (!row || row.dir) {
      continue
    }
    const prefix = `${key}/`
    if ([...map.keys()].some((other) => other.startsWith(prefix))) {
      row.dir = true
    }
  }
  return map
}

function wildcardHit(
  row: { name: string; dir: boolean; path?: string; thumb?: number },
  partial: boolean,
): SuggestHit {
  return {
    kind: 'wildcard',
    tag: partial ? `__${row.name}` : `__${row.name}__`,
    posts: 0,
    count: 0,
    favorite: false,
    partial,
    path: row.path,
    thumb: row.thumb,
  }
}

function byDepth(a: string, b: string) {
  return a.split('/').length - b.split('/').length || a.localeCompare(b)
}

export function suggestWildcardHits(query: string, items: ModelEntry[]): SuggestHit[] {
  const needle = query.slice(2).toLowerCase().replaceAll('\\', '/')
  const typed = needle.replace(/\/+$/, '')
  const paths = wildcardPaths(items)
  const exact = typed ? paths.get(typed) : undefined
  if (exact) {
    const hits = [wildcardHit(exact, false)]
    const deeper = [...paths.values()]
      .filter((row) => row.name.toLowerCase().startsWith(`${typed}/`))
      .sort((a, b) => byDepth(a.name, b.name))
    for (const row of deeper) {
      hits.push(wildcardHit(row, row.dir))
    }
    return hits.slice(0, LIMIT)
  }
  const rows: { name: string; dir: boolean; path: string; thumb: number; rank: number }[] = []
  for (const row of paths.values()) {
    const rank = typed ? wildcardRank(row.name, typed) : row.name.split('/').length
    if (typed && rank > 2) {
      continue
    }
    rows.push({ ...row, rank })
  }
  return rows
    .sort((a, b) => a.rank - b.rank || byDepth(a.name, b.name))
    .slice(0, LIMIT)
    .map((row) => wildcardHit(row, row.dir))
}

function loraRank(name: string, needle: string) {
  if (!needle) {
    return 1
  }
  const lower = name.toLowerCase()
  if (lower.startsWith(needle)) {
    return 0
  }
  if (lower.includes(needle)) {
    return 2
  }
  return 3
}

function loraNeedle(query: string) {
  if (!query.startsWith('<')) {
    return ''
  }
  const rest = query.slice(1)
  return (rest.match(/^lora:(.*)$/i)?.[1] ?? rest).toLowerCase()
}

export function suggestLoraHits(query: string, items: ModelEntry[]): SuggestHit[] {
  const needle = loraNeedle(query)
  const rows: { hit: SuggestHit; rank: number }[] = []
  for (const item of items) {
    const stem = loraStem(item.path)
    if (!stem) {
      continue
    }
    const rank = loraRank(stem, needle)
    if (rank > 2) {
      continue
    }
    rows.push({
      rank,
      hit: {
        kind: 'lora',
        tag: `<lora:${stem}>`,
        posts: 0,
        count: 0,
        favorite: false,
        extra: item.prompt || '',
        negative: item.negative_prompt || '',
        strength: Number.isFinite(Number(item.strength)) ? Number(item.strength) : 1,
        path: item.path,
        thumb: Number(item.thumb) || 0,
      },
    })
  }
  rows.sort((a, b) => a.rank - b.rank || a.hit.tag.localeCompare(b.hit.tag))
  return rows.slice(0, LIMIT).map((row) => row.hit)
}

export function applyTagUsage(
  hits: SuggestHit[],
  usage: { tag: string; count: number; favorite: boolean }[],
): SuggestHit[] {
  if (!usage.length) {
    return hits
  }
  const map = new Map(usage.map((row) => [row.tag.toLowerCase(), row]))
  return hits.map((hit) => {
    const row = usageKeys(hit).map((key) => map.get(key)).find(Boolean)
    if (!row) {
      return hit
    }
    return { ...hit, count: row.count, favorite: row.favorite }
  })
}

function usageKeys(hit: SuggestHit) {
  const tag = hit.tag.toLowerCase()
  if (hit.kind !== 'wildcard') {
    return [tag]
  }
  if (tag.endsWith('__')) {
    return [tag]
  }
  return [`${tag}__`, tag]
}

export function caretBox(el: HTMLTextAreaElement, pos: number) {
  const style = getComputedStyle(el)
  const mirror = document.createElement('div')
  for (const prop of MIRROR_PROPS) {
    const key = prop.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)
    mirror.style.setProperty(key, style.getPropertyValue(key))
  }
  mirror.style.position = 'absolute'
  mirror.style.visibility = 'hidden'
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.overflowWrap = 'break-word'
  mirror.style.overflow = 'hidden'
  mirror.style.width = `${el.clientWidth}px`
  mirror.style.height = 'auto'
  mirror.style.left = '-9999px'
  mirror.style.top = '0'
  const marker = document.createElement('span')
  marker.textContent = el.value.slice(pos, pos + 1) || '.'
  mirror.append(el.value.slice(0, pos), marker)
  document.body.append(mirror)
  const top = marker.offsetTop - el.scrollTop
  const left = marker.offsetLeft - el.scrollLeft
  const line = marker.offsetHeight || parseFloat(style.lineHeight) || 18
  mirror.remove()
  const rect = el.getBoundingClientRect()
  return { top: rect.top + top + line, left: rect.left + left, line }
}
