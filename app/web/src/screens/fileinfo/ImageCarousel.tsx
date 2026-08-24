import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { LightboxView } from '@/components/models/LightboxView.tsx'
import { isTyping, overlayOpen } from '@/lib/hotkeys.ts'
import { middleOpen } from '@/lib/gallery/openImage.ts'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

function Nav({ dir, onClick }: { dir: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      type="button"
      className={[
        'absolute top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-bg/80 text-ink shadow-md hover:bg-line',
        dir === 'left' ? 'left-1' : 'right-1',
      ].join(' ')}
      aria-label={dir === 'left' ? 'Previous image' : 'Next image'}
      onClick={onClick}
    >
      <AppIcon id={dir === 'left' ? 'chevron-left' : 'chevron-right'} size={14} />
    </button>
  )
}

export function ImageCarousel({
  urls,
  alt,
  onCurrent,
}: {
  urls: string[]
  alt: string
  onCurrent?: (url: string) => void
}) {
  const [index, setIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const wheelAcc = useRef(0)
  const n = urls.length
  const location = useLocation()
  const fileInfo = location.pathname === '/file-info'

  useEffect(() => {
    const el = stageRef.current
    if (!el || n < 2) {
      return
    }
    function onWheel(event: WheelEvent) {
      event.preventDefault()
      wheelAcc.current += event.deltaX || event.deltaY
      let steps = 0
      while (Math.abs(wheelAcc.current) >= 100) {
        steps += wheelAcc.current > 0 ? 1 : -1
        wheelAcc.current -= Math.sign(wheelAcc.current) * 100
      }
      if (!steps) {
        return
      }
      wheelAcc.current = 0
      setIndex((i) => ((i + steps) % n + n) % n)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [n])

  useEffect(() => {
    if (!n) {
      onCurrent?.('')
      return
    }
    onCurrent?.(urls[((index % n) + n) % n] || '')
  }, [index, n, onCurrent, urls])

  useEffect(() => {
    if (!fileInfo || !n) {
      return
    }
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'f' || event.repeat || event.ctrlKey || event.altKey || event.metaKey) {
        return
      }
      if (isTyping(event) || overlayOpen()) {
        return
      }
      event.preventDefault()
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fileInfo, n])

  if (!n) {
    return null
  }
  const many = n > 1
  const current = ((index % n) + n) % n
  const shown =
    n <= 3
      ? urls.map((_, i) => i)
      : [current, (current + 1) % n, (current + n - 1) % n]

  return (
    <>
      <div ref={stageRef} className="relative h-full w-full overflow-hidden">
        {shown.map((i) => {
          const url = urls[i]
          const front = i === current
          return (
            <button
              key={`${i}-${url}`}
              type="button"
              className="absolute top-1/2 left-1/2 h-[32rem] w-[min(100%,40rem)] overflow-hidden rounded-md bg-bg transition-[transform,opacity] duration-150 ease-out"
              style={{
                zIndex: front ? 20 : 10,
                opacity: front ? 1 : 0,
                transform: `translate(-50%, -50%) scale(${front ? 1 : 0.96})`,
                pointerEvents: front ? 'auto' : 'none',
              }}
              onClick={() => setOpen(true)}
              onMouseDown={(event) => middleOpen(event, url)}
            >
              <img
                src={url}
                alt=""
                className="h-full w-full object-contain"
                loading={front ? undefined : 'lazy'}
                decoding="async"
                draggable={false}
              />
            </button>
          )
        })}
        {many ? (
          <>
            <Nav dir="left" onClick={() => setIndex((i) => (i + n - 1) % n)} />
            <Nav dir="right" onClick={() => setIndex((i) => (i + 1) % n)} />
          </>
        ) : null}
        {many ? (
          <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 gap-1.5">
            {urls.map((url, i) => (
              <button
                key={`dot-${i}-${url}`}
                type="button"
                className={[
                  'h-1.5 rounded-full',
                  i === current ? 'w-4 bg-ink' : 'w-1.5 bg-muted hover:bg-ink',
                ].join(' ')}
                aria-label={`Image ${i + 1}`}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
        ) : null}
      </div>
      {open ? (
        <LightboxView
          src={urls[current]}
          alt={alt}
          resetKey={urls[current]}
          many={many}
          onClose={() => setOpen(false)}
          onPrev={() => setIndex((i) => (i + n - 1) % n)}
          onNext={() => setIndex((i) => (i + 1) % n)}
        />
      ) : null}
    </>
  )
}
