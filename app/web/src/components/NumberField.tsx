import { Chevron } from '@/components/Chevron.tsx'
import { useEffect, useState } from 'react'

type NumberFieldProps = {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
}

function draftValue(raw: string) {
  return raw === '' || raw === '-' || raw === '+' || raw === '.' || raw === '-.' || raw === '+.' || /^[+-]?\d+\.$/.test(raw)
}

export function NumberField({ value, onChange, min, max, step = 1 }: NumberFieldProps) {
  const decimals = String(step).split('.')[1]?.length ?? 0
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    setText(null)
  }, [value])

  function commit(next: number) {
    if (min != null) {
      next = Math.max(min, next)
    }
    if (max != null) {
      next = Math.min(max, next)
    }
    onChange(next)
    setText(null)
  }

  function nudge(dir: 1 | -1) {
    commit(Number((value + dir * step).toFixed(decimals)))
  }

  return (
    <div className="relative">
      <input
        className="number-field w-full rounded border border-line bg-field py-1.5 pl-2 pr-7 text-sm text-ink outline-none focus:border-accent"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={text ?? String(value)}
        onChange={(e) => {
          const raw = e.target.value
          if (draftValue(raw)) {
            setText(raw)
            return
          }
          const next = Number(raw)
          if (!Number.isFinite(next)) {
            return
          }
          commit(next)
        }}
        onBlur={() => setText(null)}
      />
      <div className="absolute inset-y-px right-px flex w-6 flex-col overflow-hidden rounded-r border-l border-line">
        <button
          type="button"
          className="flex flex-1 items-center justify-center text-muted hover:bg-line hover:text-ink"
          aria-label="Increase"
          onClick={() => nudge(1)}
        >
          <Chevron dir="up" />
        </button>
        <button
          type="button"
          className="flex flex-1 items-center justify-center border-t border-line text-muted hover:bg-line hover:text-ink"
          aria-label="Decrease"
          onClick={() => nudge(-1)}
        >
          <Chevron dir="down" />
        </button>
      </div>
    </div>
  )
}
