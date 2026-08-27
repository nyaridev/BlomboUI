import { NumberField } from '@/components/controls/number/NumberField.tsx'
import { SliderControl } from '@/components/controls/slider/SliderControl.tsx'

type SliderFieldProps = {
  label?: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
}

export function SliderField({ label, value, onChange, min, max, step = 1 }: SliderFieldProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-2">
        {label ? <span className="min-w-0 flex-1 text-xs text-muted">{label}</span> : <span className="flex-1" />}
        <div className="w-[4.75rem] shrink-0">
          <NumberField value={value} onChange={onChange} min={min} max={max} step={step} />
        </div>
      </div>
      <SliderControl value={value} onChange={onChange} min={min} max={max} step={step} />
    </div>
  )
}
