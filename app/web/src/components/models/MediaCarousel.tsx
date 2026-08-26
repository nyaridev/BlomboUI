import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { LightboxView } from '@/components/models/LightboxView.tsx'
import { PreviewMedia } from '@/components/models/PreviewMedia.tsx'
import { middleOpen } from '@/lib/gallery/openImage.ts'
import { isTyping, overlayOpen } from '@/lib/hotkeys.ts'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export type MediaCarouselItem = {
  url: string
  type?: string
  nsfw?: boolean
}

const STAGE = 'relative h-[34rem] w-full shrink-0 overflow-hidden rounded-md border border-line bg-bg'

function loopCopies(n: number) {
  if (n <= 2) {
    return 10
  }
  return 3
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

function PreviewCell({
  item,
  alt,
  blur,
  autoPlay,
  onOpen,
  onReady,
}: {
  item: MediaCarouselItem
  alt: string
  blur: boolean
  autoPlay: boolean
  onOpen: () => void
  onReady: () => void
}) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  function ready(ok: boolean) {
    if (ok) {
      setLoaded(true)
    } else {
      setFailed(true)
    }
    onReady()
  }

  return (
    <button
      type="button"
      data-slide
      className={[
        'relative isolate flex h-[32rem] shrink-0 items-center justify-center overflow-hidden bg-field [clip-path:inset(0)]',
        loaded && !failed ? '' : 'min-w-[21.333rem]',
      ].join(' ')}
      onClick={onOpen}
      onMouseDown={(event) => middleOpen(event, item.url)}
    >
      <PreviewMedia
        src={item.url}
        type={item.type}
        alt={alt}
        autoPlay={autoPlay}
        className={[
          'relative z-10 block h-[32rem] w-auto max-w-none rounded-md border border-line bg-bg object-contain transition-opacity duration-200',
          blur ? 'blur-2xl' : '',
          loaded && !failed ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
        onLoad={() => ready(true)}
        onError={() => ready(false)}
      />
      {!loaded && !failed ? (
        <span
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
          role="status"
          aria-label="Loading image"
        >
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-muted border-t-ink" />
        </span>
      ) : null}
    </button>
  )
}

function slideEls(track: HTMLElement | null) {
  return track ? [...track.querySelectorAll<HTMLElement>('[data-slide]')] : []
}

function closestIndex(track: HTMLElement, cells: HTMLElement[]) {
  const mid = track.getBoundingClientRect().left + track.clientWidth / 2
  let best = -1
  let dist = Infinity
  for (let i = 0; i < cells.length; i++) {
    const box = cells[i].getBoundingClientRect()
    const gap = Math.abs(box.left + box.width / 2 - mid)
    if (gap < dist) {
      dist = gap
      best = i
    }
  }
  return best
}

function centerCell(track: HTMLElement, cell: HTMLElement, behavior: ScrollBehavior) {
  const t = track.getBoundingClientRect()
  const c = cell.getBoundingClientRect()
  track.scrollTo({ left: track.scrollLeft + (c.left + c.width / 2) - (t.left + t.width / 2), behavior })
}

export function MediaCarousel({
  items,
  alt,
  onCurrent,
  showNsfw = true,
  openHotkey,
}: {
  items: MediaCarouselItem[]
  alt: string
  onCurrent?: (url: string) => void
  showNsfw?: boolean
  openHotkey?: string
}) {
  const n = items.length
  const many = n > 1
  const copies = many ? loopCopies(n) : 1
  const mid = n * Math.floor(copies / 2)
  const signature = items.map((item) => item.url).join('\n')
  const [center, setCenter] = useState(mid)
  const [open, setOpen] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const jumping = useRef(false)
  const moving = useRef(false)
  const wrapTimer = useRef(0)
  const nRef = useRef(n)
  const copiesRef = useRef(copies)
  const goRef = useRef<(delta: number) => void>(() => {})
  const centerRef = useRef(center)
  const lastUrl = useRef('')
  nRef.current = n
  copiesRef.current = copies
  centerRef.current = center
  const index = n ? ((center % n) + n) % n : 0
  const current = items[index]

  useEffect(() => {
    const url = n ? items[index]?.url || '' : ''
    if (url === lastUrl.current) {
      return
    }
    lastUrl.current = url
    onCurrent?.(url)
  }, [index, items, n, onCurrent])

  function jumpLoop() {
    const track = trackRef.current
    const count = nRef.current
    const copiesNow = copiesRef.current
    if (!track || !count || copiesNow < 3) {
      return
    }
    const cells = slideEls(track)
    const g = closestIndex(track, cells)
    const loopMid = count * Math.floor(copiesNow / 2)
    const target = loopMid + (((g % count) + count) % count)
    if (g < 0 || target === g || !cells[g] || !cells[target]) {
      return
    }
    jumping.current = true
    centerRef.current = target
    setCenter(target)
    centerCell(track, cells[target], 'auto')
    requestAnimationFrame(() => {
      jumping.current = false
    })
  }

  function settle() {
    const track = trackRef.current
    if (!track) {
      return
    }
    jumpLoop()
    const cells = slideEls(track)
    const g = closestIndex(track, cells)
    if (g < 0) {
      return
    }
    if (g !== centerRef.current) {
      setCenter(g)
    }
    const cell = cells[g]
    if (!cell) {
      return
    }
    const t = track.getBoundingClientRect()
    const c = cell.getBoundingClientRect()
    if (Math.abs(c.left + c.width / 2 - (t.left + t.width / 2)) > 2) {
      centerCell(track, cell, 'auto')
    }
  }

  function finishMove() {
    if (jumping.current) {
      return
    }
    window.clearTimeout(wrapTimer.current)
    wrapTimer.current = 0
    moving.current = false
    settle()
  }

  function lockCenter() {
    if (nRef.current <= 1 || jumping.current || moving.current || wrapTimer.current) {
      return
    }
    const track = trackRef.current
    if (!track) {
      return
    }
    const cells = slideEls(track)
    const g = centerRef.current
    if (!cells[g]) {
      return
    }
    centerCell(track, cells[g], 'auto')
  }

  function goTo(target: number, behavior: ScrollBehavior = 'smooth') {
    const track = trackRef.current
    if (!track) {
      return
    }
    const cells = slideEls(track)
    const cell = cells[target]
    if (!cell) {
      return
    }
    const t = track.getBoundingClientRect()
    const c = cell.getBoundingClientRect()
    setCenter(target)
    if (Math.abs(c.left + c.width / 2 - (t.left + t.width / 2)) <= 2) {
      return
    }
    moving.current = true
    centerCell(track, cell, behavior)
  }

  function go(delta: number, behavior: ScrollBehavior = 'smooth') {
    if (moving.current) {
      return
    }
    jumpLoop()
    const cells = slideEls(trackRef.current)
    goTo(Math.min(cells.length - 1, Math.max(0, centerRef.current + delta)), behavior)
  }

  goRef.current = go

  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track || !n) {
      return
    }
    setOpen(false)
    lastUrl.current = ''
    if (!many) {
      setCenter(0)
      return
    }
    const cells = slideEls(track)
    const start = mid
    if (!cells[start]) {
      return
    }
    jumping.current = true
    centerCell(track, cells[start], 'auto')
    jumping.current = false
    setCenter(start)
  }, [many, n, signature, mid])

  useEffect(() => {
    const track = trackRef.current
    if (!track || !many) {
      return
    }
    function onScroll() {
      if (jumping.current) {
        return
      }
      window.clearTimeout(wrapTimer.current)
      wrapTimer.current = window.setTimeout(finishMove, 160)
    }
    track.addEventListener('scroll', onScroll, { passive: true })
    track.addEventListener('scrollend', finishMove)
    return () => {
      track.removeEventListener('scroll', onScroll)
      track.removeEventListener('scrollend', finishMove)
      window.clearTimeout(wrapTimer.current)
      wrapTimer.current = 0
    }
  }, [many, n, signature])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || !many) {
      return
    }
    function onWheel(event: WheelEvent) {
      event.preventDefault()
      if (moving.current) {
        return
      }
      const axis = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      if (!axis) {
        return
      }
      goRef.current(axis > 0 ? 1 : -1)
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      stage.removeEventListener('wheel', onWheel)
    }
  }, [many, n, signature])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || !many) {
      return
    }
    const ro = new ResizeObserver(() => {
      lockCenter()
    })
    ro.observe(stage)
    return () => ro.disconnect()
  }, [many, n, signature])

  useEffect(() => {
    const key = openHotkey?.toLowerCase()
    if (!key || !n) {
      return
    }
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== key || event.repeat || event.ctrlKey || event.altKey || event.metaKey) {
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
  }, [openHotkey, n])

  if (!n) {
    return <div className={`flex items-center justify-center text-sm text-muted ${STAGE}`}>No images</div>
  }

  return (
    <>
      <div ref={stageRef} className={STAGE}>
        <div
          ref={trackRef}
          className={[
            'flex h-full items-center overflow-x-hidden overflow-y-hidden py-2 [scroll-behavior:auto]',
            many ? 'gap-2 pr-[50%] pl-[50%]' : 'justify-center',
          ].join(' ')}
        >
          {Array.from({ length: n * copies }, (_, g) => {
            const item = items[g % n]
            return (
              <PreviewCell
                key={`${g}-${item.url}`}
                item={item}
                alt={alt}
                blur={!showNsfw && Boolean(item.nsfw)}
                autoPlay={g === center}
                onOpen={() => {
                  goTo(g)
                  setOpen(true)
                }}
                onReady={lockCenter}
              />
            )
          })}
        </div>
        {many ? <Nav dir="left" onClick={() => go(-1)} /> : null}
        {many ? <Nav dir="right" onClick={() => go(1)} /> : null}
        {many ? (
          <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 gap-1.5">
            {items.map((item, i) => (
              <button
                key={`dot-${i}-${item.url}`}
                type="button"
                className={['h-1.5 rounded-full', i === index ? 'w-4 bg-ink' : 'w-1.5 bg-muted hover:bg-ink'].join(' ')}
                aria-label={`Image ${i + 1}`}
                onClick={() => goTo(mid + i)}
              />
            ))}
          </div>
        ) : null}
      </div>
      {open && current ? (
        <LightboxView
          src={current.url}
          type={current.type}
          alt={alt}
          resetKey={current.url}
          many={many}
          onClose={() => setOpen(false)}
          onPrev={() => go(-1)}
          onNext={() => go(1)}
        />
      ) : null}
    </>
  )
}
