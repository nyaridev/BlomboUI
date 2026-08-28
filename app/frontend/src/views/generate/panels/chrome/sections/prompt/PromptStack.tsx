import { ResizeGrip } from '@/components/controls/resizable-panel/ResizeGrip.tsx'
import { PromptField } from '@/views/generate/panels/chrome/sections/prompt/PromptSuggest.tsx'
import { useGenerateStore } from '@/stores/generateStore.ts'
import { useLayoutEffect, useRef, useState } from 'react'

const PROMPT_FRAC = 0.11
const NEGATIVE_FRAC = 0.065

function remPx() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function defaultPromptHeights(rootH: number) {
  const rem = remPx()
  const minH = 2.5 * rem
  const maxH = 20 * rem
  return {
    prompt: clamp(Math.round(rootH * PROMPT_FRAC), minH, maxH),
    negative: clamp(Math.round(rootH * NEGATIVE_FRAC), minH, maxH),
    gap: 0.5 * rem,
    rem,
    minH,
    maxH,
  }
}

function rootHeight(el: HTMLElement | null) {
  const root = el?.closest('[data-generate-root]')
  return root instanceof HTMLElement ? root.clientHeight : window.innerHeight
}

export function PromptStackPlaceholder() {
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(() => {
    const next = defaultPromptHeights(window.innerHeight)
    return next.prompt + next.negative + next.gap
  })
  useLayoutEffect(() => {
    const next = defaultPromptHeights(rootHeight(ref.current))
    setHeight(next.prompt + next.negative + next.gap)
  }, [PROMPT_FRAC, NEGATIVE_FRAC])
  return <div ref={ref} className="min-w-0 flex-1" style={{ minHeight: height }} aria-hidden />
}

export function PromptStack({ negativeDisabled }: { negativeDisabled: boolean }) {
  const prompt = useGenerateStore((s) => s.prompt)
  const negativePrompt = useGenerateStore((s) => s.negativePrompt)
  const onPrompt = useGenerateStore((s) => s.setPrompt)
  const onNegative = useGenerateStore((s) => s.setNegativePrompt)
  const fallback = defaultPromptHeights(typeof window === 'undefined' ? 800 : window.innerHeight)
  const rem = fallback.rem
  const minH = fallback.minH
  const maxH = fallback.maxH
  const stackRef = useRef<HTMLDivElement>(null)
  const [defaults, setDefaults] = useState({ prompt: fallback.prompt, negative: fallback.negative })
  const [promptH, setPromptH] = useState(defaults.prompt)
  const [negativeH, setNegativeH] = useState(defaults.negative)

  useLayoutEffect(() => {
    const next = defaultPromptHeights(rootHeight(stackRef.current))
    setDefaults({ prompt: next.prompt, negative: next.negative })
    setPromptH(next.prompt)
    setNegativeH(next.negative)
  }, [PROMPT_FRAC, NEGATIVE_FRAC, maxH, minH, rem])

  return (
    <div ref={stackRef} className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="relative" style={{ height: promptH }}>
        <PromptField value={prompt} onChange={onPrompt} placeholder="Positive" side="prompt" />
        <ResizeGrip
          value={promptH}
          onChange={setPromptH}
          onReset={() => setPromptH(defaults.prompt)}
          min={minH}
          max={maxH}
        />
      </div>
      <div className="relative" style={{ height: negativeH }}>
        <PromptField
          value={negativePrompt}
          onChange={onNegative}
          placeholder="Negative"
          disabled={negativeDisabled}
          side="negative"
        />
        <ResizeGrip
          value={negativeH}
          onChange={setNegativeH}
          onReset={() => setNegativeH(defaults.negative)}
          min={minH}
          max={maxH}
        />
      </div>
    </div>
  )
}
