import { load, YAMLException } from 'js-yaml'

const KEY = /^([A-Za-z0-9._ -]+)(:)(\s*(?:#.*)?)?$/
const KEY_VALUE = /^([A-Za-z0-9._ -]+)(:)(\s+)(.*)$/
const MAP_ITEM = /^([A-Za-z0-9._ -]+):\s*(?:#.*)?$/

export type YamlIssue = { line: number; message: string }

export type YamlBlock = {
  start: number
  end: number
  indent: number
  key: string
  path: string
}

export function yamlKeyName(trimmed: string) {
  if (!trimmed || trimmed.startsWith('#') || trimmed === '-' || trimmed.startsWith('- ')) {
    return null
  }
  const keyed = trimmed.match(KEY_VALUE) || trimmed.match(KEY)
  return keyed ? keyed[1] : null
}

export function yamlBlocks(lines: string[]): YamlBlock[] {
  const blocks: YamlBlock[] = []
  const stack: YamlBlock[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i]
    const trimmed = raw.trimStart()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }
    const indent = raw.length - trimmed.length
    while (stack.length && indent <= stack[stack.length - 1].indent) {
      stack.pop()!.end = i
    }
    const key = yamlKeyName(trimmed)
    if (!key) {
      continue
    }
    const path = [...stack.map((block) => block.key), key].join('/')
    const block = { start: i, end: lines.length, indent, key, path }
    stack.push(block)
    blocks.push(block)
  }
  while (stack.length) {
    stack.pop()!.end = lines.length
  }
  return blocks
}

export function yamlGuides(lines: string[], blocks: YamlBlock[]) {
  const out: number[][] = lines.map(() => [])
  for (const block of blocks) {
    if (block.end <= block.start + 1) {
      continue
    }
    for (let i = block.start + 1; i < block.end; i += 1) {
      out[i].push(block.indent)
    }
  }
  const last = lines.length - 1
  if (last >= 0 && !lines[last].trim()) {
    out[last] = []
  }
  return out
}

export function yamlIssues(text: string): YamlIssue[] {
  const messages = new Map<number, string>()
  function fail(line: number, msg: string) {
    const index = Math.max(0, line)
    if (!messages.has(index)) {
      messages.set(index, msg)
    }
  }

  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].includes('\t')) {
      fail(i, 'tabs are not allowed; use spaces')
    }
  }

  let mix: string | null = null
  try {
    const data = load(text)
    if (data != null) {
      if (typeof data !== 'object' || Array.isArray(data)) {
        fail(0, 'root value must be a mapping of tag names')
      } else {
        mix = mixedSections(data)
      }
    }
  } catch (err) {
    if (isYamlException(err)) {
      fail(err.mark?.line ?? 0, cleanYamlError(err))
    } else {
      fail(0, err instanceof Error ? err.message : 'invalid YAML')
    }
  }

  scanStructure(lines, fail)
  if (mix && ![...messages.values()].some((msg) => msg.includes('mixes'))) {
    fail(0, mix)
  }
  return issuesFrom(messages)
}

function issuesFrom(messages: Map<number, string>): YamlIssue[] {
  return [...messages.entries()].map(([line, message]) => ({ line, message }))
}

function isYamlException(err: unknown): err is YAMLException {
  return err instanceof YAMLException || (typeof err === 'object' && err !== null && (err as YAMLException).name === 'YAMLException')
}

function cleanYamlError(err: YAMLException) {
  const raw = (err.reason || err.message || 'invalid YAML').replace(/\n/g, ' ').trim()
  return raw.replace(/\s+in ["'][^"']*["']\s*,?/g, ' ').replace(/\s+at line \d+.*$/i, '').trim() || 'invalid YAML'
}

function mixedSections(data: unknown, name = 'root'): string | null {
  if (Array.isArray(data)) {
    if (data.some((item) => item && typeof item === 'object')) {
      return `${name} mixes entries and nested sections`
    }
    return null
  }
  if (data && typeof data === 'object') {
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const err = mixedSections(value, String(key))
      if (err) {
        return err
      }
    }
  }
  return null
}

function scanStructure(lines: string[], fail: (line: number, msg: string) => void) {
  const kindAt = new Map<number, 'map' | 'seq'>()
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
    if (kind === 'map') {
      let parent = -1
      for (const depth of kindAt.keys()) {
        if (depth < indent && depth > parent) {
          parent = depth
        }
      }
      if (parent >= 0 && kindAt.get(parent) === 'seq') {
        fail(i, 'section mixes entries and nested sections')
      }
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
}
