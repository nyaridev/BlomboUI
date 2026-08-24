import { LightboxView } from '@/components/models/LightboxView.tsx'
import { galleryItemImageUrl, galleryItemThumbUrl, listGalleryItems } from '@/lib/api.ts'
import { middleOpen } from '@/lib/gallery/openImage.ts'
import { useVisible } from '@/lib/gallery/visible.ts'
import { useEffect, useState, type MouseEvent } from 'react'

function GalleryThumb({
  id,
  onSelect,
  onMiddleClick,
}: {
  id: string
  onSelect: () => void
  onMiddleClick: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  const [ref, visible] = useVisible<HTMLButtonElement>()

  return (
    <button
      ref={ref}
      type="button"
      className="aspect-square overflow-hidden rounded-md border border-line bg-panel [content-visibility:auto]"
      onClick={onSelect}
      onMouseDown={onMiddleClick}
    >
      {visible ? (
        <img
          src={galleryItemThumbUrl(id)}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : null}
    </button>
  )
}

export function GalleryScreen() {
  const [items, setItems] = useState<{ id: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [index, setIndex] = useState<number | null>(null)

  useEffect(() => {
    void listGalleryItems()
      .then((next) => {
        setItems(next)
        setError(null)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load gallery')
      })
  }, [])

  const current = index != null ? items[index] : null
  const many = items.length > 1

  return (
    <section className="flex flex-col gap-3">
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      {items.length === 0 && !error ? (
        <p className="text-sm text-muted">No images yet. Generate something on the Generate tab.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2">
          {items.map((item, i) => {
            const full = galleryItemImageUrl(item.id)
            return (
              <GalleryThumb
                key={item.id}
                id={item.id}
                onSelect={() => setIndex(i)}
                onMiddleClick={(event) => middleOpen(event, full)}
              />
            )
          })}
        </div>
      )}
      {current ? (
        <LightboxView
          src={galleryItemImageUrl(current.id)}
          alt="Generated"
          resetKey={current.id}
          many={many}
          onClose={() => setIndex(null)}
          onPrev={() => setIndex((i) => (i == null ? 0 : (i + items.length - 1) % items.length))}
          onNext={() => setIndex((i) => (i == null ? 0 : (i + 1) % items.length))}
        />
      ) : null}
    </section>
  )
}
