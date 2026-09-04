import { middleOpen } from '@/lib/gallery/openImage.ts'
import { clampSplit, containRect, SPLIT_MAX, SPLIT_MIN } from '@/views/generate/panels/generation/sections/stage/compareWipe.ts'
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'

const STEP = 0.02

type CompareWipeProps = {
  beforeSrc: string
  afterSrc: string
  afterThumb?: string
  alt?: string
  split: number
  onSplit: (value: number) => void
  onAfterLoad?: () => void
  onAfterError?: () => void
  onBeforeError?: () => void
  onActivate?: () => void
  className?: string
}

export function CompareWipe({
  beforeSrc,
  afterSrc,
  afterThumb,
  alt = 'Comparison',
  split,
  onSplit,
  onAfterLoad,
  onAfterError,
  onBeforeError,
  onActivate,
  className,
}: CompareWipeProps) {
  const outerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const afterRef = useRef<HTMLImageElement | null>(null)
  const live = useRef(true)
  const afterSize = useRef({ w: 0, h: 0 })
  const dragRef = useRef<{ pointerId: number } | null>(null)
  const clickRef = useRef<{ x: number; y: number } | null>(null)
  const [frame, setFrame] = useState({ x: 0, y: 0, w: 0, h: 0 })
  const [thumbFailed, setThumbFailed] = useState(false)
  const [afterReady, setAfterReady] = useState(false)
  const value = clampSplit(split)
  const ready = frame.w > 1 && frame.h > 1

  function layout() {
    const outer = outerRef.current
    if (!outer) {
      return
    }
    const next = containRect(afterSize.current.w, afterSize.current.h, outer.clientWidth, outer.clientHeight)
    setFrame(next)
  }

  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  useEffect(() => {
    const img = afterRef.current
    if (img?.complete) {
      onAfterImg(img)
    }
  }, [afterSrc])

  useEffect(() => {
    const outer = outerRef.current
    if (!outer) {
      return
    }
    const observer = new ResizeObserver(() => layout())
    observer.observe(outer)
    return () => observer.disconnect()
  }, [])

  function onAfterImg(img: HTMLImageElement) {
    if (!img.naturalWidth || !img.naturalHeight) {
      return
    }
    afterSize.current = { w: img.naturalWidth, h: img.naturalHeight }
    setAfterReady(true)
    layout()
    onAfterLoad?.()
  }

  function onHandleDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId }
  }

  function onHandleMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) {
      return
    }
    const box = frameRef.current
    if (!box) {
      return
    }
    const rect = box.getBoundingClientRect()
    if (rect.width <= 0) {
      return
    }
    onSplit(clampSplit((event.clientX - rect.left) / rect.width))
  }

  function onHandleUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) {
      return
    }
    dragRef.current = null
  }

  function onHandleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    onSplit(clampSplit(value + (event.key === 'ArrowLeft' ? -STEP : STEP)))
  }

  function onStageDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (middleOpen(event, afterSrc)) {
      return
    }
    if (event.button !== 0) {
      return
    }
    clickRef.current = { x: event.clientX, y: event.clientY }
  }

  function onStageUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = clickRef.current
    clickRef.current = null
    if (!start || !onActivate || event.button !== 0) {
      return
    }
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) {
      return
    }
    onActivate()
  }

  return (
    <div
      ref={outerRef}
      className={['h-full w-full select-none', className || 'relative'].join(' ')}
      onPointerDown={onStageDown}
      onPointerUp={onStageUp}
    >
      {afterThumb && !thumbFailed && !afterReady ? (
        <img
          src={afterThumb}
          alt=""
          className="absolute inset-0 h-full w-full object-contain"
          decoding="async"
          onError={() => setThumbFailed(true)}
        />
      ) : null}
      <img
        key={afterSrc}
        src={afterSrc}
        alt={alt}
        className={['absolute inset-0 h-full w-full object-contain', afterReady && ready ? 'invisible' : ''].join(' ')}
        fetchPriority="high"
        decoding="async"
        draggable={false}
        ref={afterRef}
        onLoad={(event) => onAfterImg(event.currentTarget)}
        onError={() => onAfterError?.()}
      />
      {ready ? (
        <>
          <div
            ref={frameRef}
            className="absolute overflow-hidden"
            style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}
          >
            <img
              key={beforeSrc}
              src={beforeSrc}
              alt=""
              className="absolute inset-0 h-full w-full object-contain"
              draggable={false}
              onError={() => {
                if (live.current) {
                  onBeforeError?.()
                }
              }}
            />
            <img
              src={afterSrc}
              alt=""
              className="absolute inset-0 h-full w-full object-contain"
              draggable={false}
              style={{ clipPath: `inset(0 0 0 ${value * 100}%)` }}
            />
            <span
              className="pointer-events-none absolute top-1 left-1 origin-top-left rounded bg-bg/80 px-1.5 py-0.5 text-[10px] text-ink"
              style={{ transform: 'scale(calc(1 / var(--compare-zoom, 1)))' }}
            >
              Before
            </span>
            <span
              className="pointer-events-none absolute top-1 right-1 origin-top-right rounded bg-bg/80 px-1.5 py-0.5 text-[10px] text-ink"
              style={{ transform: 'scale(calc(1 / var(--compare-zoom, 1)))' }}
            >
              After
            </span>
          </div>
          <div
            className="pointer-events-none absolute z-20"
            style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}
          >
            <div
              data-lightbox-no-pan
              role="slider"
              aria-orientation="vertical"
              aria-label="Comparison"
              aria-valuemin={Math.round(SPLIT_MIN * 100)}
              aria-valuemax={Math.round(SPLIT_MAX * 100)}
              aria-valuenow={Math.round(value * 100)}
              tabIndex={0}
              title="Drag to compare"
              className="absolute flex cursor-col-resize items-stretch justify-center"
              style={{
                left: `${value * 100}%`,
                top: '50%',
                width: '2rem',
                height: 'calc(100% * var(--compare-zoom, 1))',
                transform: 'translate(-50%, -50%) scale(calc(1 / var(--compare-zoom, 1)))',
                pointerEvents: 'auto',
              }}
              onPointerDown={onHandleDown}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={onHandleKey}
            >
              <span className="w-1 bg-ink shadow-[0_0_0_1px_var(--color-bg)]" />
              <span className="absolute top-1/2 left-1/2 h-7 w-2 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-ink shadow-[0_0_0_1px_var(--color-bg)]" />
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
