import { LightboxView } from '@/components/models/LightboxView.tsx'
import { PreviewMedia } from '@/components/models/PreviewMedia.tsx'
import { galleryItemImageUrl, galleryItemThumbUrl, type GalleryItem } from '@/lib/api/gallery.ts'
import { middleOpen } from '@/lib/gallery/openImage.ts'
import { useVisible } from '@/lib/gallery/visible.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'

const GAP_REM = 0.5
const MIN_COL_REM = 13

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

function packColumns(items: GalleryItem[], cols: number) {
  const columns: { item: GalleryItem; index: number }[][] = Array.from({ length: cols }, () => [])
  const heights = Array(cols).fill(0)
  items.forEach((item, index) => {
    let slot = 0
    for (let c = 1; c < cols; c++) {
      if (heights[c] < heights[slot]) {
        slot = c
      }
    }
    columns[slot].push({ item, index })
    heights[slot] += 1 / aspectOf(item) + GAP_REM / MIN_COL_REM
  })
  return columns
}

function Thumb({
  item,
  onSelect,
}: {
  item: GalleryItem
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
      className="w-full overflow-hidden rounded-md border border-line bg-panel [content-visibility:auto]"
      style={{ aspectRatio: aspectCss(item) }}
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
  const [cols, setCols] = useState(1)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null)
  const setSentinelRef = useCallback((node: HTMLDivElement | null) => setSentinel(node), [])
  const current = index != null ? items[index] : null
  const many = items.length > 1
  const columns = useMemo(() => packColumns(items, cols), [items, cols])

  useEffect(() => {
    const root = scrollerRef.current
    if (!root) {
      return
    }
    function measure() {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      const gap = GAP_REM * rem
      const minCol = MIN_COL_REM * rem
      setCols(Math.max(1, Math.floor((root.clientWidth + gap) / (minCol + gap))))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root)
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
        <div className="flex gap-2">
          {columns.map((column, c) => (
            <div key={c} className="flex min-w-0 flex-1 flex-col gap-2">
              {column.map(({ item, index: itemIndex }) => (
                <Thumb key={item.id} item={item} onSelect={() => setIndex(itemIndex)} />
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
