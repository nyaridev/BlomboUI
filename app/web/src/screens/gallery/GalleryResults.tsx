import { LightboxView } from '@/components/models/LightboxView.tsx'
import { PreviewMedia } from '@/components/models/PreviewMedia.tsx'
import { galleryItemImageUrl, galleryItemThumbUrl, type GalleryItem } from '@/lib/api/gallery.ts'
import { middleOpen } from '@/lib/gallery/openImage.ts'
import { useVisible } from '@/lib/gallery/visible.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'

function tileAspect(item: GalleryItem): '2/3' | '1/1' | '3/2' {
  const width = item.width
  const height = item.height
  if (!width || !height || item.media_kind === 'video') {
    return '2/3'
  }
  const ratio = width / height
  if (ratio >= 0.9 && ratio <= 1.1) {
    return '1/1'
  }
  if (ratio > 1) {
    return '3/2'
  }
  return '2/3'
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
  const aspect = tileAspect(item)

  function onMiddle(event: MouseEvent<HTMLButtonElement>) {
    middleOpen(event, full)
  }

  return (
    <button
      ref={ref}
      type="button"
      className={[
        'h-72 shrink-0 overflow-hidden rounded-md border border-line bg-panel [content-visibility:auto]',
        aspect === '1/1' ? 'aspect-square' : aspect === '3/2' ? 'aspect-[3/2]' : 'aspect-[2/3]',
      ].join(' ')}
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
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null)
  const setSentinelRef = useCallback((node: HTMLDivElement | null) => setSentinel(node), [])
  const current = index != null ? items[index] : null
  const many = items.length > 1

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
      <div className="flex flex-wrap gap-2">
        {items.map((item, i) => (
          <Thumb key={item.id} item={item} onSelect={() => setIndex(i)} />
        ))}
      </div>
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
