import { ResizeGrip } from '@/components/ResizeGrip.tsx'
import { PromptField } from '@/screens/generate/PromptSuggest.tsx'
import { useLayoutEffect, useRef, useState } from 'react'

function remPx() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

type PromptStackProps = {
  prompt: string
  negativePrompt: string
  onPrompt: (value: string) => void
  onNegative: (value: string) => void
  negativeDisabled: boolean
}

export function PromptStack({
  prompt,
  negativePrompt,
  onPrompt,
  onNegative,
  negativeDisabled,
}: PromptStackProps) {
  const rem = remPx()
  const minH = 2.5 * rem
  const maxH = 20 * rem
  const stackRef = useRef<HTMLDivElement>(null)
  const ready = useRef(false)
  const [defaults, setDefaults] = useState({ prompt: Math.round(minH * 2.4), negative: minH })
  const [promptH, setPromptH] = useState(defaults.prompt)
  const [negativeH, setNegativeH] = useState(defaults.negative)

  useLayoutEffect(() => {
    if (ready.current) {
      return
    }
    const root = stackRef.current?.closest('[data-generate-root]')
    const h = root instanceof HTMLElement ? root.clientHeight : window.innerHeight
    const box = Math.max(10 * rem, Math.round(h * 0.26))
    const inner = Math.max(0, box - 8)
    const next = {
      prompt: clamp(Math.round(inner * 0.75 * 0.85), minH, maxH),
      negative: clamp(Math.round(inner * 0.25), minH, maxH),
    }
    ready.current = true
    setDefaults(next)
    setPromptH(next.prompt)
    setNegativeH(next.negative)
  }, [maxH, minH, rem])

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
