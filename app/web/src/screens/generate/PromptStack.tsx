import { ResizeGrip } from '@/components/ResizeGrip.tsx'
import { usePromptWeightKey } from '@/lib/promptWeight.ts'
import { useLayoutEffect, useRef, useState } from 'react'

function remPx() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function fieldClass(disabled: boolean) {
  return [
    'h-full w-full resize-none overflow-y-auto rounded border border-line bg-field px-2 py-1.5 pr-5 pb-4 font-mono text-sm text-ink outline-none placeholder:text-muted focus:border-accent',
    disabled ? 'cursor-not-allowed' : '',
  ].join(' ')
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
  const onPromptKey = usePromptWeightKey(onPrompt)
  const onNegativeKey = usePromptWeightKey(onNegative)
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
        <textarea
          className={fieldClass(false)}
          value={prompt}
          onChange={(e) => onPrompt(e.target.value)}
          onKeyDown={onPromptKey}
          placeholder="Positive"
          spellCheck={false}
        />
        <ResizeGrip
          value={promptH}
          onChange={setPromptH}
          onReset={() => setPromptH(defaults.prompt)}
          min={minH}
          max={maxH}
        />
      </div>
      <div className="relative" style={{ height: negativeH }}>
        <textarea
          className={fieldClass(negativeDisabled)}
          value={negativePrompt}
          onChange={(e) => onNegative(e.target.value)}
          onKeyDown={onNegativeKey}
          placeholder="Negative"
          spellCheck={false}
          disabled={negativeDisabled}
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
