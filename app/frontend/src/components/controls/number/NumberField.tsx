import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { PrimitiveButton } from '@/components/primitives/PrimitiveButton.tsx'
import { PrimitiveInput } from '@/components/primitives/PrimitiveInput.tsx'
import { useEffect, useRef, useState } from 'react'

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
  const focused = useRef(false)
  const shown = text ?? String(value)

  useEffect(() => {
    if (!focused.current) {
      setText(null)
    }
  }, [value])

  function inRange(next: number) {
    return (min == null || next >= min) && (max == null || next <= max)
  }

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

  function finish() {
    focused.current = false
    if (text == null) {
      return
    }
    if (draftValue(text) || !Number.isFinite(Number(text))) {
      setText(null)
      return
    }
    commit(Number(text))
  }

  function nudge(dir: 1 | -1) {
    commit(Number((value + dir * step).toFixed(decimals)))
  }

  return (
    <div className="relative">
      <PrimitiveInput
        className={[
          'number-field w-full rounded border border-line bg-field py-1.5 pl-2 text-sm text-ink outline-none focus:border-accent',
          suffix ? 'pr-14' : 'pr-7',
        ].join(' ')}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={shown}
        onFocus={() => {
          focused.current = true
        }}
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
          setText(raw)
          if (inRange(next)) {
            onChange(next)
          }
        }}
        onBlur={finish}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur()
          }
        }}
      />
      {suffix ? (
        <span className="pointer-events-none absolute inset-y-0 left-2 right-7 flex items-center text-sm">
          <span className="invisible">{shown}</span>
          <span className="pl-1 text-muted">{suffix}</span>
        </span>
      ) : null}
      <div className="absolute inset-y-px right-px flex w-6 flex-col overflow-hidden rounded-r border-l border-line">
        <PrimitiveButton
          className="flex flex-1 items-center justify-center text-muted hover:bg-line hover:text-ink"
          aria-label="Increase"
          onClick={() => nudge(1)}
        >
          <AppIcon id="chevron-up" size={10} />
        </PrimitiveButton>
        <PrimitiveButton
          className="flex flex-1 items-center justify-center border-t border-line text-muted hover:bg-line hover:text-ink"
          aria-label="Decrease"
          onClick={() => nudge(-1)}
        >
          <AppIcon id="chevron-down" size={10} />
        </PrimitiveButton>
      </div>
    </div>
  )
}
