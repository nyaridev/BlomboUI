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

export function removeWildcardAt(prompt: string, index: number) {
  const hit = parseWildcardTags(prompt)[index]
  if (!hit) {
    return prompt
  }
  return prompt
    .slice(0, hit.start)
    .concat(prompt.slice(hit.end))
    .replace(/,\s*,+/g, ',')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ \t,]+/, '')
    .replace(/[ \t,]+$/, '')
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
  return `${trimmed} ${tag}`
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
