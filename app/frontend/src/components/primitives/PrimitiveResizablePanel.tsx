import { type PointerEvent, type ReactNode, type RefObject } from 'react'

export function PrimitiveResizablePanel({
  value,
  onChange,
  onReset,
  min,
  containerRef,
  maxRatio = 0.45,
  className,
  title,
  children,
}: {
  value: number
  onChange: (value: number) => void
  onReset?: () => void
  min: number
  containerRef: RefObject<HTMLElement | null>
  maxRatio?: number
  className?: string
  title?: string
  children?: ReactNode
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
      title={title}
      className={className}
      onPointerDown={onDown}
      onDoubleClick={() => onReset?.()}
    >
      {children}
    </div>
  )
}
