const TAG = /<lora:([^:>]+)(?::([^>]*))?>/gi

export function loraStem(path: string) {
  const base = path.replace(/\\/g, '/').split('/').pop() || path
  return base.replace(/\.[^/.]+$/, '')
}

export function parseLoraTags(prompt: string) {
  return parseLoraHits(prompt).map(({ name, strength }) => ({ name, strength }))
}

export function parseLoraHits(prompt: string) {
  const out: { name: string; strength: number; invalid: boolean; raw: string; start: number; end: number }[] = []
  const re = new RegExp(TAG.source, 'gi')
  let match: RegExpExecArray | null
  while ((match = re.exec(prompt))) {
    const raw = match[2]
    const parsed = parseLoraStrength(raw)
    out.push({
      name: match[1],
      strength: parsed.strength,
      invalid: parsed.invalid,
      raw: raw ?? '',
      start: match.index,
      end: match.index + match[0].length,
    })
  }
  return out
}

function parseLoraStrength(raw: string | undefined) {
  if (raw == null) {
    return { strength: 1, invalid: false }
  }
  const text = raw.trim()
  if (!text) {
    return { strength: 1, invalid: true }
  }
  const strength = Number(text)
  if (!Number.isFinite(strength)) {
    return { strength: 1, invalid: true }
  }
  return { strength, invalid: false }
}

export function formatLoraStrength(value: number) {
  if (!Number.isFinite(value)) {
    return '1'
  }
  return String(Number(value.toFixed(2)))
}

export function storedLoraStrengthLabel(strength?: number, slider?: boolean) {
  const n = Number.isFinite(Number(strength)) ? Number(strength) : 1
  if (!slider && Math.abs(n - 1) < 1e-6) {
    return ''
  }
  return formatLoraStrength(n)
}

export function loraNameMatches(tagName: string, path: string) {
  const stem = loraStem(path).toLowerCase()
  const posix = path.replace(/\\/g, '/').toLowerCase()
  const file = posix.split('/').pop() || posix
  const noExt = posix.replace(/\.[^/.]+$/, '')
  const name = tagName.replace(/\\/g, '/').toLowerCase()
  return name === stem || name === posix || name === file || name === noExt
}

export function promptHasLora(prompt: string, path: string) {
  return parseLoraTags(prompt).some((tag) => loraNameMatches(tag.name, path))
}

export function toggleLoraPrompts(
  prompt: string,
  negative: string,
  path: string,
  extraPositive = '',
  extraNegative = '',
  strength = 1,
) {
  const name = loraStem(path)
  if (promptHasLora(prompt, path)) {
    return {
      prompt: removeLoraBlock(prompt, name, extraPositive),
      negativePrompt: removeTrailingTags(negative, extraNegative),
    }
  }
  return {
    prompt: appendPromptChunk(addLoraTag(prompt, name, strength), extraPositive),
    negativePrompt: appendPromptChunk(negative, extraNegative),
  }
}

function escapeRe(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function splitTags(text: string) {
  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function tidyPrompt(text: string) {
  return text
    .replace(/,\s*,+/g, ',')
    .replace(/^[ \t,]+/, '')
    .replace(/[ \t,]+$/, '')
}

export function appendPromptChunk(text: string, chunk: string) {
  const extra = chunk.trim()
  if (!extra) {
    return text
  }
  const trimmed = text.replace(/[ \t,]+$/, '')
  if (!trimmed) {
    return extra
  }
  if (trimmed.endsWith(',')) {
    return `${trimmed} ${extra}`
  }
  return `${trimmed}, ${extra}`
}

function isSpaceOrComma(ch: string) {
  return ch === ',' || ch === ' ' || ch === '\t'
}

function findLastLoraTag(prompt: string, name: string) {
  const re = new RegExp(`<lora:${escapeRe(name)}(?::[^>]+)?>`, 'gi')
  let match: RegExpExecArray | null
  let last: { start: number; end: number } | null = null
  while ((match = re.exec(prompt))) {
    last = { start: match.index, end: match.index + match[0].length }
  }
  return last
}

function removeLoraBlock(prompt: string, name: string, extraPositive: string) {
  const hit = findLastLoraTag(prompt, name)
  if (!hit) {
    return prompt
  }
  return cutLoraHit(prompt, hit, extraPositive)
}

export function removeLoraAt(prompt: string, negative: string, index: number, extraPositive = '', extraNegative = '') {
  const hit = parseLoraHits(prompt)[index]
  if (!hit) {
    return { prompt, negativePrompt: negative }
  }
  return {
    prompt: cutLoraHit(prompt, hit, extraPositive),
    negativePrompt: removeTrailingTags(negative, extraNegative),
  }
}

function cutLoraHit(prompt: string, hit: { start: number; end: number }, extraPositive: string) {
  const allowed = new Set(splitTags(extraPositive).map((item) => item.toLowerCase()))
  let end = hit.end
  while (end < prompt.length && isSpaceOrComma(prompt[end] || '')) {
    end += 1
  }
  let pos = end
  while (pos < prompt.length) {
    const tokenStart = pos
    while (pos < prompt.length && prompt[pos] !== ',') {
      pos += 1
    }
    const token = prompt.slice(tokenStart, pos).trim()
    if (!token || !allowed.has(token.toLowerCase())) {
      break
    }
    end = pos
    while (end < prompt.length && isSpaceOrComma(prompt[end] || '')) {
      end += 1
    }
    pos = end
  }
  return tidyPrompt(prompt.slice(0, hit.start) + prompt.slice(end))
}

function addLoraTag(prompt: string, name: string, strength: number) {
  const tag = `<lora:${name}:${strength}>`
  const trimmed = prompt.replace(/[ \t,]+$/, '')
  if (!trimmed) {
    return tag
  }
  if (trimmed.endsWith(',')) {
    return `${trimmed} ${tag}`
  }
  return `${trimmed}, ${tag}`
}

function removeTrailingTags(text: string, extra: string) {
  const allowed = new Set(splitTags(extra).map((item) => item.toLowerCase()))
  if (!allowed.size) {
    return text
  }
  const tags = splitTags(text)
  while (tags.length && allowed.has((tags[tags.length - 1] || '').toLowerCase())) {
    tags.pop()
  }
  return tags.join(', ')
}
