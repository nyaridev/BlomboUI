import * as Slider from '@radix-ui/react-slider'
import type { CSSProperties } from 'react'

export function PrimitiveSlider({
  value,
  onChange,
  min,
  max,
  step = 1,
  className,
  trackClassName,
  rangeClassName,
  thumbClassName,
  style,
  disabled,
}: {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  className?: string
  trackClassName?: string
  rangeClassName?: string
  thumbClassName?: string
  style?: CSSProperties
  disabled?: boolean
}) {
  return (
    <Slider.Root
      className={className}
      style={style}
      min={min}
      max={max}
      step={step}
      value={[value]}
      disabled={disabled}
      onValueChange={(next) => onChange(next[0] ?? min)}
    >
      <Slider.Track className={trackClassName}>
        <Slider.Range className={rangeClassName} />
      </Slider.Track>
      <Slider.Thumb className={thumbClassName} />
    </Slider.Root>
  )
}
