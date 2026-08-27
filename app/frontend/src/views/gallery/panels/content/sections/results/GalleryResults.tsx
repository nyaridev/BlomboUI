import { LightboxView } from '@/components/composites/models/LightboxView.tsx'
import { PreviewMedia } from '@/components/composites/models/PreviewMedia.tsx'
import { galleryItemImageUrl, galleryItemThumbUrl, type GalleryItem } from '@/lib/api/gallery.ts'
import { middleOpen } from '@/lib/gallery/openImage.ts'
import { useVisible } from '@/lib/gallery/visible.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'

const GAP_REM = 0.5
const TARGET_H_REM = 20

function aspectOf(item: GalleryItem): number {
  const width = item.width
  const height = item.height
  if (!width || !height || item.media_kind === 'video') {
    return 2 / 3
  }
  return width / height
}

function aspectCss(item: GalleryItem) {
  const width = item.width
  const height = item.height
  if (!width || !height || item.media_kind === 'video') {
    return '2 / 3'
  }
  return `${width} / ${height}`
}

type PackedRow = { height: number; cells: { item: GalleryItem; index: number; aspect: number }[] }

function packRows(items: GalleryItem[], width: number, gap: number, targetH: number): PackedRow[] {
  if (width <= 0 || targetH <= 0) {
    return []
  }
  const rows: PackedRow[] = []
  let start = 0
  let sum = 0

  function flush(end: number, stretch: boolean) {
    const cells = items.slice(start, end).map((item, offset) => ({
      item,
      index: start + offset,
      aspect: aspectOf(item),
    }))
    if (!cells.length) {
      return
    }
    const aspects = cells.reduce((total, cell) => total + cell.aspect, 0)
    const inner = width - gap * (cells.length - 1)
    const fitted = inner / aspects
    rows.push({ height: stretch ? fitted : Math.min(targetH, fitted), cells })
  }

  items.forEach((item, index) => {
    const aspect = aspectOf(item)
    const count = index - start + 1
    const next = sum + aspect
    const atTarget = next * targetH + gap * (count - 1)
    if (count > 1 && atTarget > width) {
      flush(index, true)
      start = index
      sum = aspect
      return
    }
    sum = next
  })
  flush(items.length, false)
  return rows
}

function Thumb({
  item,
  width,
  height,
  onSelect,
}: {
  item: GalleryItem
  width: number
  height: number
  onSelect: () => void
}) {
  const [ref, visible] = useVisible<HTMLButtonElement>()
  const full = galleryItemImageUrl(item.id)
  const videoFormat = useSettingsStore((s) => s.galleryItemThumbVideoFormat)
  const asVideo = item.media_kind === 'video' && videoFormat === 'video'

  function onMiddle(event: MouseEvent<HTMLButtonElement>) {
    middleOpen(event, full)
  }

  return (
    <button
      ref={ref}
      type="button"
      className="shrink-0 overflow-hidden rounded-md border border-line bg-panel [content-visibility:auto]"
      style={{ width, height, aspectRatio: aspectCss(item) }}
      onClick={onSelect}
      onMouseDown={onMiddle}
    >
      {visible ? (
        <PreviewMedia
          src={galleryItemThumbUrl(item.id)}
          type={asVideo ? 'video' : undefined}
          className="h-full w-full object-cover"
        />
      ) : null}
    </button>
  )
}

export function GalleryResults({
  items,
  error,
  hasNext,
  loadingMore,
  onMore,
}: {
  items: GalleryItem[]
  error: string | null
  hasNext: boolean
  loadingMore: boolean
  onMore: () => void
}) {
  const [index, setIndex] = useState<number | null>(null)
  const [box, setBox] = useState({ width: 0, gap: 8, targetH: 208 })
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null)
  const setSentinelRef = useCallback((node: HTMLDivElement | null) => setSentinel(node), [])
  const current = index != null ? items[index] : null
  const many = items.length > 1
  const rows = useMemo(
    () => packRows(items, box.width, box.gap, box.targetH),
    [items, box.width, box.gap, box.targetH],
  )

  useEffect(() => {
    const root = scrollerRef.current
    if (!root) {
      return
    }
    const node: HTMLDivElement = root
    function measure() {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      setBox({ width: node.clientWidth, gap: GAP_REM * rem, targetH: TARGET_H_REM * rem })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const root = scrollerRef.current
    if (!root || !sentinel || !hasNext || loadingMore) {
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          onMore()
        }
      },
      { root, rootMargin: '200px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasNext, loadingMore, onMore, sentinel])

  return (
    <div ref={scrollerRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      {items.length === 0 && !error ? <p className="text-sm text-muted">No matching generations.</p> : null}
      {items.length ? (
        <div className="flex flex-col gap-2">
          {rows.map((row, rowIndex) => (
            <div key={rowIndex} className="flex gap-2">
              {row.cells.map(({ item, index: itemIndex, aspect }) => (
                <Thumb
                  key={item.id}
                  item={item}
                  width={row.height * aspect}
                  height={row.height}
                  onSelect={() => setIndex(itemIndex)}
                />
              ))}
            </div>
          ))}
        </div>
      ) : null}
      {hasNext ? (
        <div ref={setSentinelRef} className="flex h-12 w-full items-center justify-center" aria-hidden={!loadingMore}>
          {loadingMore ? (
            <span
              className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-ink"
              role="status"
              aria-label="Loading more"
            />
          ) : null}
        </div>
      ) : null}
      {current ? (
        <LightboxView
          src={galleryItemImageUrl(current.id)}
          type={current.media_kind === 'video' ? 'video' : undefined}
          alt="Generated"
          resetKey={current.id}
          many={many}
          onClose={() => setIndex(null)}
          onPrev={() => setIndex((i) => (i == null ? 0 : (i + items.length - 1) % items.length))}
          onNext={() => setIndex((i) => (i == null ? 0 : (i + 1) % items.length))}
        />
      ) : null}
    </div>
  )
}
