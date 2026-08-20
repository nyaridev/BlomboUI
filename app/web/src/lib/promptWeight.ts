import { parseLoraHits } from '@/lib/loraTags.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useLayoutEffect, useRef, type KeyboardEvent } from 'react'

export type WeightEdit = { text: string; start: number; end: number }

type WeightGroup = {
  wrapStart: number
  wrapEnd: number
  innerStart: number
  innerEnd: number
  weight: number
}

function stepDecimals(step: number) {
  const frac = step.toFixed(4).replace(/0+$/, '').split('.')[1] || ''
  return Math.min(4, Math.max(1, frac.length))
}

function roundStep(value: number, step: number) {
  return Number(value.toFixed(stepDecimals(step)))
}

function formatWeight(value: number, step: number) {
  const n = roundStep(value, step)
  if (!Number.isFinite(n) || Object.is(n, -0)) {
    return '0'
  }
  return String(n)
}

function nearOne(value: number, step: number) {
  return roundStep(value, step) === 1
}

function trimRange(text: string, start: number, end: number) {
  let a = start
  let b = end
  while (a < b && /\s/.test(text[a] || '')) {
    a += 1
  }
  while (b > a && /\s/.test(text[b - 1] || '')) {
    b -= 1
  }
  return { start: a, end: b }
}

function weightGroups(text: string) {
  const out: WeightGroup[] = []
  const re = /:([+-]?(?:\d+\.?\d*|\.\d+))\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text))) {
    const weight = Number(match[1])
    if (!Number.isFinite(weight)) {
      continue
    }
    const wrapEnd = match.index + match[0].length
    const colon = match.index
    let depth = 0
    let wrapStart = -1
    for (let i = colon - 1; i >= 0; i -= 1) {
      const ch = text[i]
      if (ch === ')') {
        depth += 1
      } else if (ch === '(') {
        if (depth === 0) {
          wrapStart = i
          break
        }
        depth -= 1
      }
    }
    if (wrapStart < 0) {
      continue
    }
    out.push({ wrapStart, wrapEnd, innerStart: wrapStart + 1, innerEnd: colon, weight })
  }
  return out
}

function pickGroup(groups: WeightGroup[], start: number, end: number) {
  const wrap = groups.find((g) => g.wrapStart === start && g.wrapEnd === end)
  if (wrap) {
    return wrap
  }
  const inner = groups.find((g) => g.innerStart === start && g.innerEnd === end)
  if (inner) {
    return inner
  }
  if (start !== end) {
    return null
  }
  const containing = groups.filter((g) => g.wrapStart <= start && start <= g.wrapEnd)
  if (!containing.length) {
    return null
  }
  return containing.reduce((best, g) => (g.wrapEnd - g.wrapStart < best.wrapEnd - best.wrapStart ? g : best))
}

function splitLoraRaw(raw: string) {
  const parts = raw.split(':')
  const first = (parts[0] || '').trim()
  const extra = parts.slice(1).join(':')
  const n = Number(first)
  return {
    strength: first === '' || !Number.isFinite(n) ? 1 : n,
    extra,
  }
}

function formatLoraTag(name: string, strength: number, extra: string, step: number) {
  const value = formatWeight(strength, step)
  if (extra) {
    return `<lora:${name}:${value}:${extra}>`
  }
  return `<lora:${name}:${value}>`
}

function pickLora(text: string, start: number, end: number) {
  for (const hit of parseLoraHits(text)) {
    const caret = start === end && start >= hit.start && start <= hit.end
    const overlap = start < hit.end && end > hit.start
    if (!caret && !overlap) {
      continue
    }
    const tag = text.slice(hit.start, hit.end)
    const inside = start >= hit.start && end <= hit.end
    const same = text.slice(start, end).trim() === tag
    if (caret || inside || same) {
      return hit
    }
  }
  return null
}

function replaceRange(text: string, start: number, end: number, next: string, selStart: number, selEnd: number): WeightEdit {
  return {
    text: text.slice(0, start) + next + text.slice(end),
    start: selStart,
    end: selEnd,
  }
}

export function nudgePromptWeight(text: string, start: number, end: number, dir: 1 | -1, step: number): WeightEdit | null {
  const delta = Number.isFinite(step) && step > 0 ? step : 0.1
  let a = Math.min(start, end)
  let b = Math.max(start, end)

  const lora = pickLora(text, a, b)
  if (lora) {
    const parsed = splitLoraRaw(lora.raw)
    const strength = roundStep(parsed.strength + dir * delta, delta)
    const tag = formatLoraTag(lora.name, strength, parsed.extra, delta)
    return replaceRange(text, lora.start, lora.end, tag, lora.start, lora.start + tag.length)
  }

  const group = pickGroup(weightGroups(text), a, b)
  if (group) {
    const inner = text.slice(group.innerStart, group.innerEnd)
    const weight = roundStep(group.weight + dir * delta, delta)
    if (nearOne(weight, delta)) {
      return replaceRange(text, group.wrapStart, group.wrapEnd, inner, group.wrapStart, group.wrapStart + inner.length)
    }
    const wrap = `(${inner}:${formatWeight(weight, delta)})`
    return replaceRange(text, group.wrapStart, group.wrapEnd, wrap, group.wrapStart + 1, group.wrapStart + 1 + inner.length)
  }

  if (a === b) {
    return null
  }
  const trimmed = trimRange(text, a, b)
  a = trimmed.start
  b = trimmed.end
  if (a === b) {
    return null
  }
  const inner = text.slice(a, b)
  const weight = roundStep(1 + dir * delta, delta)
  if (nearOne(weight, delta)) {
    return null
  }
  const wrap = `(${inner}:${formatWeight(weight, delta)})`
  return replaceRange(text, a, b, wrap, a + 1, a + 1 + inner.length)
}

export function usePromptWeightKey(onChange: (value: string) => void) {
  const step = useSettingsStore((s) => s.promptWeightStep)
  const pending = useRef<{ el: HTMLTextAreaElement; start: number; end: number } | null>(null)

  useLayoutEffect(() => {
    const next = pending.current
    if (!next) {
      return
    }
    pending.current = null
    if (document.contains(next.el)) {
      next.el.setSelectionRange(next.start, next.end)
    }
  })

  return (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.defaultPrevented || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey)) {
      return
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return
    }
    const el = event.currentTarget
    if (el.disabled || el.readOnly) {
      return
    }
    const next = nudgePromptWeight(
      el.value,
      el.selectionStart ?? 0,
      el.selectionEnd ?? 0,
      event.key === 'ArrowUp' ? 1 : -1,
      step,
    )
    if (!next) {
      return
    }
    event.preventDefault()
    pending.current = { el, start: next.start, end: next.end }
    onChange(next.text)
  }
}
