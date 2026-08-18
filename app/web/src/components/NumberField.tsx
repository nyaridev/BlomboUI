import { Chevron } from '@/components/Chevron.tsx'

type NumberFieldProps = {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
}

export function NumberField({ value, onChange, min, max, step = 1 }: NumberFieldProps) {
  const decimals = String(step).split('.')[1]?.length ?? 0

  function nudge(dir: 1 | -1) {
    let next = Number((value + dir * step).toFixed(decimals))
    if (min != null) {
      next = Math.max(min, next)
    }
    if (max != null) {
      next = Math.min(max, next)
    }
    onChange(next)
  }

  return (
    <div className="relative">
      <input
        className="number-field w-full rounded border border-line bg-field py-1.5 pl-2 pr-7 text-sm text-ink outline-none focus:border-accent"
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
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
