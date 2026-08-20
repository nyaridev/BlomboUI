import { AppIcon } from '@/components/AppIcon.tsx'
import { useEffect, useState } from 'react'

type NumberFieldProps = {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
}

function draftValue(raw: string) {
  return raw === '' || raw === '-' || raw === '+' || raw === '.' || raw === '-.' || raw === '+.' || /^[+-]?\d+\.$/.test(raw)
}

export function NumberField({ value, onChange, min, max, step = 1, suffix }: NumberFieldProps) {
  const decimals = String(step).split('.')[1]?.length ?? 0
  const [text, setText] = useState<string | null>(null)
  const shown = text ?? String(value)

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
        className={[
          'number-field w-full rounded border border-line bg-field py-1.5 pl-2 text-sm text-ink outline-none focus:border-accent',
          suffix ? 'pr-14' : 'pr-7',
        ].join(' ')}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={shown}
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
      {suffix ? (
        <span className="pointer-events-none absolute inset-y-0 left-2 right-7 flex items-center text-sm">
          <span className="invisible">{shown}</span>
          <span className="pl-1 text-muted">{suffix}</span>
        </span>
      ) : null}
      <div className="absolute inset-y-px right-px flex w-6 flex-col overflow-hidden rounded-r border-l border-line">
        <button
          type="button"
          className="flex flex-1 items-center justify-center text-muted hover:bg-line hover:text-ink"
          aria-label="Increase"
          onClick={() => nudge(1)}
        >
          <AppIcon id="chevron-up" size={10} />
        </button>
        <button
          type="button"
          className="flex flex-1 items-center justify-center border-t border-line text-muted hover:bg-line hover:text-ink"
          aria-label="Decrease"
          onClick={() => nudge(-1)}
        >
          <AppIcon id="chevron-down" size={10} />
        </button>
      </div>
    </div>
  )
}
