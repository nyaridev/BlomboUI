const KEY = /^([A-Za-z0-9._ -]+)(:)(\s*(?:#.*)?)?$/
const KEY_VALUE = /^([A-Za-z0-9._ -]+)(:)(\s+)(.*)$/
const MAP_ITEM = /^([A-Za-z0-9._ -]+):\s*(?:#.*)?$/

export type YamlSpan = { kind: 'indent' | 'key' | 'punct' | 'dash' | 'comment' | 'text'; text: string }

export function yamlKeyName(trimmed: string) {
  if (!trimmed || trimmed.startsWith('#') || trimmed === '-' || trimmed.startsWith('- ')) {
    return null
  }
  const keyed = trimmed.match(KEY_VALUE) || trimmed.match(KEY)
  return keyed ? keyed[1] : null
}

export function yamlErrorLines(text: string, serverError?: string) {
  const messages = new Map<number, string>()
  const lines = text.split('\n')
  const kindAt = new Map<number, 'map' | 'seq'>()

  function fail(index: number, msg: string) {
    if (!messages.has(index)) {
      messages.set(index, msg)
    }
  }

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i]
    const trimmed = raw.trimStart()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }
    const indent = raw.length - trimmed.length
    for (const depth of [...kindAt.keys()]) {
      if (depth > indent) {
        kindAt.delete(depth)
      }
    }
    const item = trimmed === '-' || trimmed.startsWith('- ')
    const rest = item ? trimmed.slice(1).trim() : trimmed
    const keyLine = KEY.test(trimmed.split(/\s+#/)[0].trim()) || KEY_VALUE.test(trimmed)
    const kind: 'map' | 'seq' | null = item ? 'seq' : keyLine ? 'map' : null
    const prev = kindAt.get(indent)
    if (kind && prev && prev !== kind) {
      fail(i, 'section mixes entries and nested sections')
    }
    if (kind) {
      kindAt.set(indent, kind)
    }
    if (indent === 0 && item) {
      fail(i, 'root value must be a mapping of tag names')
    }
    if (item && MAP_ITEM.test(rest)) {
      fail(i, 'section mixes entries and nested sections')
    }
  }

  const mark = serverError?.match(/line (\d+)/i)
  if (mark) {
    const index = Math.max(0, Number(mark[1]) - 1)
    if (!messages.has(index)) {
      messages.set(index, serverError.replace(/\n/g, ' ').trim())
    }
  }

  return { messages }
}

export function yamlSpans(line: string): YamlSpan[] {
  const trimmed = line.trimStart()
  const indent = line.slice(0, line.length - trimmed.length)
  const out: YamlSpan[] = []
  if (indent) {
    out.push({ kind: 'indent', text: indent })
  }
  if (!trimmed) {
    return out
  }
  if (trimmed.startsWith('#')) {
    out.push({ kind: 'comment', text: trimmed })
    return out
  }
  if (trimmed === '-' || trimmed.startsWith('- ')) {
    out.push({ kind: 'dash', text: '-' })
    const rest = trimmed.slice(1)
    if (rest) {
      out.push(...valueSpans(rest))
    }
    return out
  }
  const keyed = trimmed.match(KEY_VALUE) || trimmed.match(KEY)
  if (keyed) {
    out.push({ kind: 'key', text: keyed[1] })
    out.push({ kind: 'punct', text: keyed[2] })
    if (keyed[3]) {
      out.push(...valueSpans(keyed[3]))
    }
    if (keyed[4]) {
      out.push(...valueSpans(keyed[4]))
    }
    return out
  }
  out.push({ kind: 'text', text: trimmed })
  return out
}

function valueSpans(text: string): YamlSpan[] {
  const cut = text.indexOf('#')
  if (cut > 0 && /\s/.test(text[cut - 1] || '')) {
    return [
      { kind: 'text', text: text.slice(0, cut) },
      { kind: 'comment', text: text.slice(cut) },
    ]
  }
  if (text.startsWith('#')) {
    return [{ kind: 'comment', text }]
  }
  return [{ kind: 'text', text }]
}
