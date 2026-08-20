import { CloseIcon } from '@/components/CloseIcon.tsx'
import { middleOpen } from '@/lib/openImage.ts'
import { useEffect, useRef, type PointerEvent } from 'react'
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
      className="absolute top-1.5 right-1.5 z-10 flex h-7 w-7 items-center justify-center rounded bg-bg/80 text-muted hover:text-ink"
      aria-label="Close"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      <CloseIcon />
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

function paint(img: HTMLImageElement | null, next: { scale: number; x: number; y: number }) {
  if (next.scale <= MIN) {
    next = { scale: MIN, x: 0, y: 0 }
  }
  if (img) {
    img.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`
  }
  return next
}

export function LightboxView({ src, alt, resetKey, many, onClose, onPrev, onNext }: LightboxViewProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const viewRef = useRef({ scale: MIN, x: 0, y: 0 })
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const navRef = useRef({ many, onPrev, onNext })
  const wheelAcc = useRef(0)
  navRef.current = { many, onPrev, onNext }

  function apply(next: { scale: number; x: number; y: number }) {
    viewRef.current = paint(imgRef.current, next)
  }

  useEffect(() => {
    apply({ scale: MIN, x: 0, y: 0 })
  }, [resetKey])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' || event.key.toLowerCase() === 'f') {
        event.preventDefault()
        onClose()
        return
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
    function overImage(event: WheelEvent) {
      const img = imgRef.current
      if (!img) {
        return false
      }
      const r = img.getBoundingClientRect()
      return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom
    }

    function onWheel(event: WheelEvent) {
      event.preventDefault()
      const nav = navRef.current
      const view = viewRef.current
      const delta = event.deltaX || event.deltaY
      if (nav.many && view.scale <= MIN && !overImage(event)) {
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
      wheelAcc.current = 0
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
    if (middleOpen(event, src)) {
      event.stopPropagation()
      return
    }
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const view = viewRef.current
    dragRef.current = { x: view.x, y: view.y, px: event.clientX, py: event.clientY }
    event.currentTarget.style.transition = 'none'
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

  function onPointerUp(event: PointerEvent<HTMLImageElement>) {
    dragRef.current = null
    event.currentTarget.style.transition = 'transform 140ms ease-out'
  }

  return createPortal(
    <div
      ref={stageRef}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-bg/75 backdrop-blur-md"
      data-overlay
      onClick={onClose}
    >
      <CloseButton onClick={onClose} />
      {many ? <Arrow dir="left" onClick={onPrev} /> : null}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className="max-h-[92vh] max-w-[92vw] object-contain"
        style={{
          transform: 'translate(0px, 0px) scale(1)',
          transition: 'transform 140ms ease-out',
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
