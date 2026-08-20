import { yamlKeyName } from './yamlLint.ts'

export type YamlBlock = {
  start: number
  end: number
  indent: number
  key: string
  path: string
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
  return out
}

export function foldYaml(text: string, collapsed: Set<string>) {
  const lines = text.split('\n')
  const blocks = yamlBlocks(lines)
  const hidden = new Array(lines.length).fill(false)
  for (const block of blocks) {
    if (!collapsed.has(block.path) || block.end <= block.start + 1) {
      continue
    }
    for (let i = block.start + 1; i < block.end; i += 1) {
      hidden[i] = true
    }
  }
  const shown: string[] = []
  const srcOf: number[] = []
  for (let i = 0; i < lines.length; i += 1) {
    if (hidden[i]) {
      continue
    }
    shown.push(lines[i])
    srcOf.push(i)
  }
  return { text: shown.join('\n'), srcOf, blocks, lines }
}

export function applyFoldEdit(source: string, collapsed: Set<string>, visible: string) {
  const prev = foldYaml(source, collapsed)
  if (visible === prev.text) {
    return source
  }
  const oldVis = prev.text.split('\n')
  const newVis = visible.split('\n')
  const src = source.split('\n')
  const { srcOf } = prev
  const n = oldVis.length
  const m = newVis.length
  let a = 0
  let b = 0
  while (a < n && a < m && oldVis[a] === newVis[a]) {
    a += 1
  }
  while (b < n - a && b < m - a && oldVis[n - 1 - b] === newVis[m - 1 - b]) {
    b += 1
  }
  const fromSrc = a < n ? srcOf[a] : src.length
  const toSrc = b === 0 ? src.length : srcOf[n - b]
  const newMid = newVis.slice(a, m - b)
  const oldMid = n - a - b
  let mid: string[]
  if (oldMid === newMid.length) {
    mid = []
    for (let k = 0; k < oldMid; k += 1) {
      const vi = a + k
      const start = srcOf[vi]
      const end = vi + 1 < n ? srcOf[vi + 1] : toSrc
      mid.push(newMid[k], ...src.slice(start + 1, end))
    }
  } else {
    mid = newMid
  }
  return [...src.slice(0, fromSrc), ...mid, ...src.slice(toSrc)].join('\n')
}
