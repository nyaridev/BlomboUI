import { PrimitiveSlider } from '@/components/primitives/PrimitiveSlider.tsx'

export function SliderControl({
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled,
  className = '',
}: {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  disabled?: boolean
  className?: string
}) {
  return (
    <PrimitiveSlider
      className={['slider-control', className].filter(Boolean).join(' ')}
      trackClassName="slider-control-track"
      rangeClassName="slider-control-range"
      thumbClassName="slider-control-thumb"
      value={value}
      onChange={onChange}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
    />
  )
}
