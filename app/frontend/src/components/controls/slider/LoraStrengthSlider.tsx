import { formatLoraStrength } from '@/lib/prompt/loraTags.ts'
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
  const lockedRef = useRef<HTMLElement[]>([])

  function lockWidth() {
    if (lockedRef.current.length) {
      return
    }
    const el = sliderRef.current
    if (!el) {
      return
    }
    const tile = el.closest<HTMLElement>('[data-model-tile]')
    const nodes = tile ? [el, tile] : [el]
    for (const node of nodes) {
      node.style.width = `${node.getBoundingClientRect().width}px`
    }
    lockedRef.current = nodes
  }

  function unlockWidth() {
    for (const node of lockedRef.current) {
      node.style.width = ''
    }
    lockedRef.current = []
  }

  function valueAtPointer(event: PointerEvent<HTMLElement>) {
    const input = sliderRef.current?.querySelector<HTMLInputElement>('.lora-strength-slider-input')
    const rect = input?.getBoundingClientRect()
    if (!rect || !rect.width) {
      return
    }
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const steps = Math.round((ratio * (safeMax - safeMin)) / 0.05)
    onChange(Number((safeMin + steps * 0.05).toFixed(10)))
  }

  function finish(event: PointerEvent<HTMLElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    unlockWidth()
  }

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    event.preventDefault()
    event.stopPropagation()
    lockWidth()
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
          onPointerUp={finish}
          onPointerCancel={finish}
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
        onPointerUp={finish}
        onPointerCancel={finish}
        onDragStart={(event) => event.preventDefault()}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  )
}
