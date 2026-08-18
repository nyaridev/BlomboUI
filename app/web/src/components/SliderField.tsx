import { NumberField } from '@/components/NumberField.tsx'
import type { CSSProperties } from 'react'

type SliderFieldProps = {
  label?: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
}

export function SliderField({ label, value, onChange, min, max, step = 1 }: SliderFieldProps) {
  const fill = max === min ? 0 : ((value - min) / (max - min)) * 100
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-2">
        {label ? <span className="min-w-0 flex-1 text-xs text-muted">{label}</span> : <span className="flex-1" />}
        <div className="w-[4.75rem] shrink-0">
          <NumberField value={value} onChange={onChange} min={min} max={max} step={step} />
        </div>
      </div>
      <input
        className="slider"
        style={{ '--fill': `${Math.min(100, Math.max(0, fill))}%` } as CSSProperties}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}
