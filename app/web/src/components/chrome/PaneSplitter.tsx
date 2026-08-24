import { type PointerEvent, type RefObject } from 'react'

export function PaneSplitter({
  value,
  onChange,
  onReset,
  min,
  containerRef,
  maxRatio = 0.45,
}: {
  value: number
  onChange: (value: number) => void
  onReset?: () => void
  min: number
  containerRef: RefObject<HTMLElement | null>
  maxRatio?: number
}) {
  function onDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    if (event.detail > 1) {
      onReset?.()
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startW = value

    function onMove(move: globalThis.PointerEvent) {
      const row = containerRef.current
      const max = row ? row.clientWidth * maxRatio : startW
      onChange(Math.max(min, Math.min(max, startW + move.clientX - startX)))
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title={onReset ? 'Drag to resize. Double-click to reset.' : 'Drag to resize'}
      className="group flex w-2 shrink-0 cursor-col-resize items-stretch justify-center select-none"
      onPointerDown={onDown}
      onDoubleClick={() => onReset?.()}
    >
      <span className="w-px bg-line group-hover:bg-ink" />
    </div>
  )
}
