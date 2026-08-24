import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { LightboxView } from '@/components/models/LightboxView.tsx'
import { middleOpen } from '@/lib/gallery/openImage.ts'
import type { CivitaiModelImage } from '@/lib/api.ts'
import { useRef, useState } from 'react'

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
  image,
  alt,
  blur,
  onOpen,
}: {
  image: CivitaiModelImage
  alt: string
  blur: boolean
  onOpen: () => void
}) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  return (
    <button
      type="button"
      className={[
        'relative isolate flex h-[32rem] shrink-0 items-center justify-center overflow-hidden bg-field [clip-path:inset(0)]',
        loaded && !failed ? '' : 'min-w-[21.333rem]',
      ].join(' ')}
      onClick={onOpen}
      onMouseDown={(event) => middleOpen(event, image.url)}
    >
      <img
        src={image.url}
        alt={alt}
        className={[
          'relative z-10 block h-[32rem] w-auto max-w-none rounded-md border border-line bg-bg object-contain transition-opacity duration-200',
          blur ? 'blur-2xl' : '',
          loaded && !failed ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
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

export function CivitaiPreviewStrip({
  images,
  alt,
  showNsfw,
}: {
  images: CivitaiModelImage[]
  alt: string
  showNsfw: boolean
}) {
  const [open, setOpen] = useState<number | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const n = images.length

  function shift(direction: number) {
    trackRef.current?.scrollBy({
      left: direction * Math.max(240, trackRef.current.clientWidth * 0.75),
      behavior: 'smooth',
    })
  }

  if (!n) {
    return (
      <div className="flex h-[34rem] shrink-0 items-center justify-center rounded-md border border-line bg-bg text-sm text-muted">
        No preview images.
      </div>
    )
  }

  const lit = open === null ? 0 : open

  return (
    <>
      <div className="relative h-[34rem] w-full shrink-0 overflow-hidden rounded-md border border-line bg-bg">
        <div
          ref={trackRef}
          className="flex h-full items-center gap-2 overflow-x-auto overflow-y-hidden p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {images.map((image, i) => {
            const blur = !showNsfw && image.nsfw
            return (
              <PreviewCell
                key={`${i}-${image.url}`}
                image={image}
                alt={alt}
                blur={blur}
                onOpen={() => setOpen(i)}
              />
            )
          })}
        </div>
        {n > 1 ? (
          <>
            <Nav dir="left" onClick={() => shift(-1)} />
            <Nav dir="right" onClick={() => shift(1)} />
          </>
        ) : null}
      </div>
      {open !== null ? (
        <LightboxView
          src={images[lit]?.url || ''}
          alt={alt}
          resetKey={images[lit]?.url || ''}
          many={n > 1}
          onClose={() => setOpen(null)}
          onPrev={() => setOpen((i) => (i === null ? 0 : (i + n - 1) % n))}
          onNext={() => setOpen((i) => (i === null ? 0 : (i + 1) % n))}
        />
      ) : null}
    </>
  )
}
