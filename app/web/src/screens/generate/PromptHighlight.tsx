import { loraNameMatches, parseLoraHits } from '@/lib/loraTags.ts'
import { parseWildcardTags } from '@/lib/wildcardTags.ts'
import type { ModelEntry } from '@/lib/api.ts'
import { forwardRef, type ReactNode } from 'react'

type PromptHighlightProps = {
  text: string
  loras: ModelEntry[]
  side: 'prompt' | 'negative'
}

type HighlightRange = {
  start: number
  end: number
  kind: 'lora' | 'wildcard' | 'weight'
}

const KIND_CLASS = {
  lora: 'prompt-highlight-lora',
  wildcard: 'prompt-highlight-wildcard',
  weight: 'prompt-highlight-weight',
} as const

function triggerWords(prompt: string) {
  return prompt
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function matchingTriggerRanges(text: string, end: number, prompt: string): HighlightRange[] | null {
  const expected = triggerWords(prompt)
  if (!expected.length) {
    return []
  }
  const ranges: HighlightRange[] = []
  let cursor = end
  for (const word of expected) {
    const separator = text.slice(cursor).match(/^\s*,\s*/)
    if (!separator) {
      return null
    }
    ranges.push({ start: cursor, end: cursor + separator[0].length, kind: 'lora' })
    const wordStart = cursor + separator[0].length
    const comma = text.indexOf(',', wordStart)
    const segmentEnd = comma < 0 ? text.length : comma
    const actual = text.slice(wordStart, segmentEnd).trim()
    if (actual.toLowerCase() !== word.toLowerCase()) {
      return null
    }
    const leading = text.slice(wordStart, segmentEnd).search(/\S/)
    if (leading < 0) {
      return null
    }
    const first = wordStart + leading
    ranges.push({ start: first, end: first + actual.length, kind: 'lora' })
    cursor = segmentEnd
  }
  return ranges
}

function raisedWeightRanges(text: string): HighlightRange[] {
  const ranges: HighlightRange[] = []
  const re = /:([+-]?(?:\d+\.?\d*|\.\d+))\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text))) {
    if (Number(match[1]) <= 1) {
      continue
    }
    const colon = match.index
    let depth = 0
    let start = -1
    for (let index = colon - 1; index >= 0; index -= 1) {
      const char = text[index]
      if (char === ')') {
        depth += 1
      } else if (char === '(') {
        if (depth === 0) {
          start = index
          break
        }
        depth -= 1
      }
    }
    if (start >= 0) {
      ranges.push({ start, end: match.index + match[0].length, kind: 'weight' })
    }
  }
  return ranges
}

function rangesFor(text: string, loras: ModelEntry[], side: PromptHighlightProps['side']) {
  const ranges: HighlightRange[] = []
  for (const hit of parseLoraHits(text)) {
    ranges.push({ start: hit.start, end: hit.end, kind: 'lora' })
    const item = loras.find((row) => loraNameMatches(hit.name, row.path))
    if (!item) {
      continue
    }
    const triggers = matchingTriggerRanges(text, hit.end, side === 'negative' ? item.negative_prompt || '' : item.prompt || '')
    if (triggers) {
      ranges.push(...triggers)
    }
  }
  for (const hit of parseWildcardTags(text)) {
    ranges.push({ start: hit.start, end: hit.end, kind: 'wildcard' })
  }
  ranges.push(...raisedWeightRanges(text))
  return ranges
}

function rangePriority(kind: HighlightRange['kind']) {
  return kind === 'lora' ? 3 : kind === 'wildcard' ? 2 : 1
}

function renderText(text: string, ranges: HighlightRange[]): ReactNode[] {
  const points = new Set([0, text.length])
  for (const range of ranges) {
    points.add(range.start)
    points.add(range.end)
  }
  const sorted = [...points].sort((left, right) => left - right)
  const output: ReactNode[] = []
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index]
    const end = sorted[index + 1]
    if (start === end) {
      continue
    }
    const range = ranges
      .filter((item) => item.start <= start && item.end >= end)
      .sort((left, right) => rangePriority(right.kind) - rangePriority(left.kind))[0]
    const content = text.slice(start, end)
    output.push(
      range ? (
        <span key={`${start}:${end}`} className={KIND_CLASS[range.kind]}>
          {content}
        </span>
      ) : (
        <span key={`${start}:${end}`}>{content}</span>
      ),
    )
  }
  if (!text) {
    output.push(<span key="empty"> </span>)
  }
  return output
}

export const PromptHighlight = forwardRef<HTMLDivElement, PromptHighlightProps>(function PromptHighlight({ text, loras, side }, ref) {
  return (
    <div ref={ref} aria-hidden="true" className="prompt-highlight pointer-events-none absolute inset-px z-0 overflow-hidden rounded px-2 py-1.5 pr-5 pb-4 font-mono text-sm">
      {renderText(text, rangesFor(text, loras, side))}
    </div>
  )
})
