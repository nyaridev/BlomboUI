import { AppIcon } from '@/components/AppIcon.tsx'
import { type PointerEvent } from 'react'

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function ResizeGrip({
  value,
  onChange,
  onReset,
  min,
  max,
}: {
  value: number
  onChange: (value: number) => void
  onReset: () => void
  min: number
  max: number
}) {
  function onDown(event: PointerEvent<HTMLButtonElement>) {
    event.stopPropagation()
    if (event.detail > 1) {
      event.preventDefault()
      onReset()
      return
    }
    const startY = event.clientY
    const box = event.currentTarget.parentElement
    const startH = value || box?.clientHeight || min
    let dragged = false
    event.currentTarget.setPointerCapture(event.pointerId)

    function onMove(move: globalThis.PointerEvent) {
      const dy = move.clientY - startY
      if (!dragged) {
        if (Math.abs(dy) < 4) {
          return
        }
        dragged = true
      }
      onChange(clamp(startH + dy, min, max))
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <button
      type="button"
      aria-label="Resize"
      title="Drag to resize. Double-click to reset."
      className="absolute right-0 bottom-0 z-10 flex h-5 w-5 cursor-ns-resize items-end justify-end bg-field p-0.5 text-muted hover:text-ink"
      onPointerDown={onDown}
      onDoubleClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onReset()
      }}
    >
      <AppIcon id="grip-horizontal" size={11} />
    </button>
  )
}
