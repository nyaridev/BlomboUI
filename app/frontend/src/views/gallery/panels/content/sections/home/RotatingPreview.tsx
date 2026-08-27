import { PreviewMedia } from '@/components/composites/models/PreviewMedia.tsx'
import { galleryItemImageUrl, galleryItemThumbUrl, type GalleryPreview } from '@/lib/api/gallery.ts'
import { useEffect, useRef, useState } from 'react'

function srcOf(item: GalleryPreview) {
  return item.media_kind === 'video' ? galleryItemImageUrl(item.id) : galleryItemThumbUrl(item.id)
}

function layerClass(on: boolean) {
  return [
    'absolute inset-0 transition-opacity duration-700',
    on ? 'opacity-100' : 'opacity-0',
  ].join(' ')
}

export function RotatingPreview({ items }: { items: GalleryPreview[] }) {
  const [index, setIndex] = useState(0)
  const [front, setFront] = useState(0)
  const [slots, setSlots] = useState<[GalleryPreview | null, GalleryPreview | null]>([items[0] ?? null, null])
  const frontRef = useRef(0)
  const seen = useRef('')
  const itemsRef = useRef(items)
  const prevItems = useRef(items)
  itemsRef.current = items
  let resolved = index
  if (prevItems.current !== items) {
    const id = seen.current || prevItems.current[index]?.id
    prevItems.current = items
    if (items.length) {
      if (id) {
        const found = items.findIndex((item) => item.id === id)
        resolved = found >= 0 ? found : Math.min(index, items.length - 1)
      } else {
        resolved = Math.min(index, items.length - 1)
      }
    } else {
      resolved = 0
    }
    if (resolved !== index) {
      setIndex(resolved)
    }
  }
  const current = items[resolved] ?? items[0] ?? null
  const currentId = current?.id ?? ''
  useEffect(() => {
    if (!currentId) {
      seen.current = ''
      return
    }
    if (seen.current === currentId) {
      return
    }
    const item = itemsRef.current.find((row) => row.id === currentId) ?? itemsRef.current[0]
    if (!item) {
      return
    }
    const first = seen.current === ''
    seen.current = currentId
    if (first) {
      setSlots([item, null])
      frontRef.current = 0
      setFront(0)
      return
    }
    const hidden = 1 - frontRef.current
    setSlots((prev) => {
      const next: [GalleryPreview | null, GalleryPreview | null] = [prev[0], prev[1]]
      next[hidden] = item
      return next
    })
    let innerFrame = 0
    const outerFrame = window.requestAnimationFrame(() => {
      innerFrame = window.requestAnimationFrame(() => {
        frontRef.current = hidden
        setFront(hidden)
      })
    })
    return () => {
      window.cancelAnimationFrame(outerFrame)
      window.cancelAnimationFrame(innerFrame)
    }
  }, [currentId])

  useEffect(() => {
    if (items.length < 2) {
      return
    }
    const timer = window.setInterval(() => {
      setIndex((value) => (value + 1) % items.length)
    }, 3000)
    return () => window.clearInterval(timer)
  }, [items.length])

  if (!current) {
    return <div className="h-full w-full bg-field" />
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-field">
      {slots.map((item, slot) =>
        item ? (
          <div key={slot} className={layerClass(front === slot)}>
            <PreviewMedia
              src={srcOf(item)}
              type={item.media_kind === 'video' ? 'video' : undefined}
              autoPlay={front === slot}
              className="h-full w-full object-cover"
            />
          </div>
        ) : null,
      )}
    </div>
  )
}
