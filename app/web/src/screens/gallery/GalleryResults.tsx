import { LightboxView } from '@/components/models/LightboxView.tsx'
import { galleryItemImageUrl, galleryItemThumbUrl, type GalleryItem } from '@/lib/api/gallery.ts'
import { middleOpen } from '@/lib/gallery/openImage.ts'
import { useVisible } from '@/lib/gallery/visible.ts'
import { useState, type MouseEvent } from 'react'

function Thumb({
  item,
  onSelect,
}: {
  item: GalleryItem
  onSelect: () => void
}) {
  const [ref, visible] = useVisible<HTMLButtonElement>()
  const full = galleryItemImageUrl(item.id)

  function onMiddle(event: MouseEvent<HTMLButtonElement>) {
    middleOpen(event, full)
  }

  return (
    <button
      ref={ref}
      type="button"
      className="aspect-square overflow-hidden rounded-md border border-line bg-panel [content-visibility:auto]"
      onClick={onSelect}
      onMouseDown={onMiddle}
    >
      {visible ? (
        <img src={galleryItemThumbUrl(item.id)} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
      ) : null}
    </button>
  )
}

export function GalleryResults({
  items,
  error,
  cursor,
  onMore,
}: {
  items: GalleryItem[]
  error: string | null
  cursor: string
  onMore: () => void
}) {
  const [index, setIndex] = useState<number | null>(null)
  const current = index != null ? items[index] : null
  const many = items.length > 1

  return (
    <div className="flex flex-col gap-3">
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      {items.length === 0 && !error ? <p className="text-sm text-muted">No matching generations.</p> : null}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2">
        {items.map((item, i) => (
          <Thumb key={item.id} item={item} onSelect={() => setIndex(i)} />
        ))}
      </div>
      {cursor ? (
        <button type="button" className="self-center rounded border border-line bg-field px-3 py-1.5 text-sm text-ink" onClick={onMore}>
          Load more
        </button>
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
