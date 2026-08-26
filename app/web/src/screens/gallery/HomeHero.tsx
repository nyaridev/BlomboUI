import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { PreviewMedia } from '@/components/models/PreviewMedia.tsx'
import { galleryItemImageUrl, galleryItemThumbUrl, type GalleryItem } from '@/lib/api/gallery.ts'
import { useEffect, useState } from 'react'

const SPAN = 3

function wrapOffset(i: number, index: number, n: number) {
  let delta = i - index
  const half = n / 2
  if (delta > half) {
    delta -= n
  }
  if (delta < -half) {
    delta += n
  }
  return delta
}

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

export function HomeHero({
  items,
  onOpen,
}: {
  items: GalleryItem[]
  onOpen: (item: GalleryItem) => void
}) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const ids = items.map((item) => item.id).join()
  const n = items.length
  const many = n > 1
  const current = n ? items[Math.min(index, n - 1)] : null

  useEffect(() => {
    setIndex(0)
  }, [ids])

  useEffect(() => {
    if (paused || n < 2) {
      return
    }
    const timer = window.setInterval(() => {
      setIndex((value) => (value + 1) % n)
    }, 4000)
    return () => window.clearInterval(timer)
  }, [paused, n])

  if (!current) {
    return null
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-ink">Recent generations</h2>
      <div
        className="relative h-[22rem] overflow-hidden"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div className="absolute inset-0 [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
          {items.map((item, i) => {
            const delta = wrapOffset(i, Math.min(index, n - 1), n)
            const abs = Math.abs(delta)
            if (abs > SPAN) {
              return null
            }
            const on = delta === 0
            return (
              <button
                key={item.id}
                type="button"
                className={[
                  'absolute top-1/2 left-1/2 h-80 w-52 overflow-hidden rounded-md border bg-panel/70 shadow-md backdrop-blur-md transition-[transform,opacity] duration-700 ease-out',
                  on ? 'border-accent' : 'border-line',
                ].join(' ')}
                style={{
                  transform: `translate(-50%, -50%) translateX(${delta * 9.5}rem) scale(${1 - abs * 0.12})`,
                  opacity: Math.max(0.2, 1 - abs * 0.28),
                  zIndex: SPAN + 1 - abs,
                }}
                aria-label={on ? 'Open image' : 'Show this image'}
                onClick={() => (on ? onOpen(item) : setIndex(i))}
              >
                <PreviewMedia
                  src={on ? galleryItemImageUrl(item.id) : galleryItemThumbUrl(item.id)}
                  type={on && item.media_kind === 'video' ? 'video' : undefined}
                  autoPlay={on}
                  className="h-full w-full object-cover"
                />
                {on ? null : <div className="pointer-events-none absolute inset-0 bg-bg/45 backdrop-blur-[2px]" />}
              </button>
            )
          })}
        </div>
        {many ? (
          <>
            <Nav dir="left" onClick={() => setIndex((value) => (value + n - 1) % n)} />
            <Nav dir="right" onClick={() => setIndex((value) => (value + 1) % n)} />
          </>
        ) : null}
      </div>
    </section>
  )
}
