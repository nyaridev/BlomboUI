export type TextEdit = { text: string; start: number; end: number }

const INDENT = '  '

function selectedLines(text: string, start: number, end: number) {
  const a = Math.min(start, end)
  const b = Math.max(start, end)
  const from = text.lastIndexOf('\n', a - 1) + 1
  let until = b
  if (b > a && text[b - 1] === '\n') {
    until = b - 1
  }
  const nl = text.indexOf('\n', until)
  return { from, to: nl < 0 ? text.length : nl, a, b }
}

function lineIndent(line: string) {
  return line.match(/^[ \t]*/)?.[0] ?? ''
}

function isEmptyYamlEntry(line: string) {
  return /^-\s*$/.test(line.slice(lineIndent(line).length))
}

function unindentLine(line: string) {
  let next = line
  if (next.startsWith('\t')) {
    next = next.slice(1)
  } else if (next.startsWith(INDENT)) {
    next = next.slice(INDENT.length)
  } else if (next.startsWith(' ')) {
    next = next.slice(1)
  }
  if (isEmptyYamlEntry(next)) {
    return lineIndent(next)
  }
  return next
}

function rewriteLines(text: string, start: number, end: number, fn: (line: string) => string): TextEdit {
  const { from, to, a, b } = selectedLines(text, start, end)
  const lines = text.slice(from, to).split('\n')
  let oldPos = from
  let newPos = from
  let na = a
  let nb = b
  const out: string[] = []
  for (const line of lines) {
    const next = fn(line)
    const delta = next.length - line.length
    const oldEnd = oldPos + line.length
    if (oldEnd < a) {
      na += delta
    } else if (a >= oldPos) {
      na = newPos + Math.max(0, Math.min(next.length, a - oldPos + delta))
    }
    if (oldEnd < b) {
      nb += delta
    } else if (b >= oldPos) {
      nb = newPos + Math.max(0, Math.min(next.length, b - oldPos + delta))
    }
    out.push(next)
    oldPos = oldEnd + 1
    newPos += next.length + 1
  }
  return {
    text: text.slice(0, from) + out.join('\n') + text.slice(to),
    start: na,
    end: nb,
  }
}

export function indentLines(text: string, start: number, end: number): TextEdit {
  return rewriteLines(text, start, end, (line) => INDENT + line)
}

export function unindentLines(text: string, start: number, end: number): TextEdit {
  return rewriteLines(text, start, end, unindentLine)
}

export function moveLines(text: string, start: number, end: number, dir: -1 | 1): TextEdit | null {
  const { from, to, a, b } = selectedLines(text, start, end)
  if (dir < 0) {
    if (from === 0) {
      return null
    }
    const prevFrom = text.lastIndexOf('\n', from - 2) + 1
    const prev = text.slice(prevFrom, from - 1)
    const block = text.slice(from, to)
    const delta = -(prev.length + 1)
    return {
      text: text.slice(0, prevFrom) + block + '\n' + prev + text.slice(to),
      start: a + delta,
      end: b + delta,
    }
  }
  if (to >= text.length || text[to] !== '\n') {
    return null
  }
  const nl = text.indexOf('\n', to + 1)
  const nextTo = nl < 0 ? text.length : nl
  const after = text.slice(to + 1, nextTo)
  const block = text.slice(from, to)
  const delta = after.length + 1
  return {
    text: text.slice(0, from) + after + '\n' + block + text.slice(nextTo),
    start: a + delta,
    end: b + delta,
  }
}

export function isSingleLineChunk(text: string, start: number, end: number) {
  const a = Math.min(start, end)
  const b = Math.max(start, end)
  return a !== b && !text.slice(a, b).includes('\n')
}

export function continueLine(text: string, start: number, end: number, yaml = false): TextEdit {
  const a = Math.min(start, end)
  const b = Math.max(start, end)
  const from = text.lastIndexOf('\n', a - 1) + 1
  const nl = text.indexOf('\n', a)
  const lineEnd = nl < 0 ? text.length : nl
  const line = text.slice(from, lineEnd)
  const indent = lineIndent(line)
  const trimmed = line.slice(indent.length)
  if (yaml && isEmptyYamlEntry(line)) {
    return {
      text: text.slice(0, from) + indent + text.slice(lineEnd),
      start: from + indent.length,
      end: from + indent.length,
    }
  }
  const entry = yaml && (trimmed === '-' || trimmed.startsWith('- '))
  const insert = `\n${indent}${entry ? '- ' : ''}`
  return {
    text: text.slice(0, a) + insert + text.slice(b),
    start: a + insert.length,
    end: a + insert.length,
  }
}
