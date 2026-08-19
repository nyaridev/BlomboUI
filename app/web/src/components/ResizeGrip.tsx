import { type PointerEvent } from 'react'

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function GripIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
      <path
        d="M10 1 1 10M10 5 5 10M10 8 8 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
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
      className="absolute right-0 bottom-0 z-10 flex h-5 w-5 cursor-ns-resize items-end justify-end p-0.5 text-muted hover:text-ink"
      onPointerDown={onDown}
      onDoubleClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onReset()
      }}
    >
      <GripIcon />
    </button>
  )
}
