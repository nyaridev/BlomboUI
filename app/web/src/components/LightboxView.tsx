import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'

type LightboxViewProps = {
  src: string
  alt: string
  resetKey: string
  many: boolean
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}

const MIN = 1
const MAX = 8

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="absolute top-1.5 right-1.5 z-10 flex h-6 w-6 items-center justify-center rounded bg-bg/80 text-muted hover:text-ink"
      aria-label="Close"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      <svg width="11" height="11" viewBox="0 0 14 14" aria-hidden="true">
        <path
          d="M3 3 11 11M11 3 3 11"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  )
}

function Arrow({ dir, onClick }: { dir: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      type="button"
      className={[
        'absolute top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded bg-bg/70 text-ink hover:bg-line',
        dir === 'left' ? 'left-3' : 'right-3',
      ].join(' ')}
      aria-label={dir === 'left' ? 'Previous' : 'Next'}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path
          d={dir === 'left' ? 'M11 4 6 9l5 5' : 'M7 4l5 5-5 5'}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

export function LightboxView({ src, alt, resetKey, many, onClose, onPrev, onNext }: LightboxViewProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef({ scale: MIN, x: 0, y: 0 })
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const navRef = useRef({ many, onPrev, onNext })
  const wheelAcc = useRef(0)
  const [scale, setScale] = useState(MIN)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [panning, setPanning] = useState(false)
  navRef.current = { many, onPrev, onNext }

  function apply(next: { scale: number; x: number; y: number }) {
    if (next.scale <= MIN) {
      next = { scale: MIN, x: 0, y: 0 }
    }
    viewRef.current = next
    setScale(next.scale)
    setPos({ x: next.x, y: next.y })
  }

  useEffect(() => {
    apply({ scale: MIN, x: 0, y: 0 })
  }, [resetKey])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
      if (event.key === 'ArrowLeft' && many) {
        onPrev()
      }
      if (event.key === 'ArrowRight' && many) {
        onNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [many, onClose, onPrev, onNext])

  useEffect(() => {
    const el = stageRef.current
    if (!el) {
      return
    }
    function onWheel(event: WheelEvent) {
      event.preventDefault()
      const nav = navRef.current
      const view = viewRef.current
      const delta = event.deltaX || event.deltaY
      if (nav.many && !event.ctrlKey && view.scale <= MIN) {
        wheelAcc.current += delta
        let moved = false
        while (Math.abs(wheelAcc.current) >= 100) {
          if (wheelAcc.current > 0) {
            nav.onNext()
          } else {
            nav.onPrev()
          }
          wheelAcc.current -= Math.sign(wheelAcc.current) * 100
          moved = true
        }
        if (moved) {
          wheelAcc.current = 0
        }
        return
      }
      const nextScale = Math.min(MAX, Math.max(MIN, view.scale * Math.exp(-event.deltaY * 0.002)))
      const ratio = nextScale / view.scale
      const rect = el.getBoundingClientRect()
      const cx = event.clientX - rect.left - rect.width / 2
      const cy = event.clientY - rect.top - rect.height / 2
      apply({
        scale: nextScale,
        x: view.x * ratio + cx * (1 - ratio),
        y: view.y * ratio + cy * (1 - ratio),
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  function onPointerDown(event: PointerEvent<HTMLImageElement>) {
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const view = viewRef.current
    dragRef.current = { x: view.x, y: view.y, px: event.clientX, py: event.clientY }
    setPanning(true)
  }

  function onPointerMove(event: PointerEvent<HTMLImageElement>) {
    const drag = dragRef.current
    if (!drag) {
      return
    }
    apply({
      scale: viewRef.current.scale,
      x: drag.x + event.clientX - drag.px,
      y: drag.y + event.clientY - drag.py,
    })
  }

  function onPointerUp() {
    dragRef.current = null
    setPanning(false)
  }

  return createPortal(
    <div
      ref={stageRef}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-bg/90"
      onClick={onClose}
    >
      <CloseButton onClick={onClose} />
      {many ? <Arrow dir="left" onClick={onPrev} /> : null}
      <img
        src={src}
        alt={alt}
        className="max-h-[92vh] max-w-[92vw] object-contain"
        style={{
          transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
          transition: panning ? 'none' : 'transform 140ms ease-out',
          cursor: 'all-scroll',
          touchAction: 'none',
        }}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        draggable={false}
      />
      {many ? <Arrow dir="right" onClick={onNext} /> : null}
    </div>,
    document.body,
  )
}
