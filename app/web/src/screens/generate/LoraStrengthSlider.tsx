import { formatLoraStrength } from '@/lib/loraTags.ts'
import { useRef, type CSSProperties, type PointerEvent } from 'react'

export function LoraStrengthSlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  const current = Number.isFinite(value) ? value : min
  const safeMin = Math.min(min, max, current)
  const safeMax = Math.max(min, max, current)
  const safeValue = Math.min(safeMax, Math.max(safeMin, current))
  const fill = safeMax === safeMin ? 100 : ((safeValue - safeMin) / (safeMax - safeMin)) * 100
  const sliderRef = useRef<HTMLDivElement>(null)

  function valueAtPointer(event: PointerEvent<HTMLElement>) {
    const input = sliderRef.current?.querySelector<HTMLInputElement>('.lora-strength-slider-input')
    const rect = input?.getBoundingClientRect()
    if (!rect || !rect.width) {
      return
    }
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const steps = Math.round((ratio * (safeMax - safeMin)) / 0.05)
    const next = safeMin + steps * 0.05
    onChange(Number(next.toFixed(10)))
  }

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    event.preventDefault()
    event.stopPropagation()
    const input = sliderRef.current?.querySelector<HTMLInputElement>('.lora-strength-slider-input')
    input?.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    valueAtPointer(event)
  }

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      valueAtPointer(event)
    }
  }

  return (
    <div
      ref={sliderRef}
      className="lora-strength-slider"
      style={{ '--fill': `${Math.min(100, Math.max(0, fill))}%` } as CSSProperties}
    >
      <div className="lora-strength-slider-track" aria-hidden="true">
        <div className="lora-strength-slider-fill-start" />
        <div className="lora-strength-slider-fill-range">
          <div className="lora-strength-slider-fill" />
        </div>
      </div>
      <div className="lora-strength-slider-thumb-range" aria-hidden="true">
        <div
          className="lora-strength-slider-thumb"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId)
            }
          }}
          onPointerCancel={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId)
            }
          }}
        >
          <span />
        </div>
      </div>
      <input
        aria-label={`LoRA strength for ${label}`}
        title={`LoRA strength: ${formatLoraStrength(safeValue)}`}
        className="lora-strength-slider-input"
        type="range"
        min={safeMin}
        max={safeMax}
        step={0.05}
        value={safeValue}
        draggable={false}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
        }}
        onPointerCancel={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
        }}
        onDragStart={(event) => event.preventDefault()}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  )
}
