import { generationImageUrl } from '@/lib/api.ts'
import { ProgressBar } from '@/components/ProgressBar.tsx'
import { LightboxView } from './LightboxView.tsx'
import { ThumbStrip, type ThumbItem } from './ThumbStrip.tsx'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type ImageStageProps = {
  images: string[]
  gridUrl: string | null
  busy: boolean
  previewUrl: string | null
  progressPct: number
  progressLabel: string
  jobProgressPct?: number
  jobProgressLabel?: string | null
  timing?: string | null
}

export function ImageStage({
  images,
  gridUrl,
  busy,
  previewUrl,
  progressPct,
  progressLabel,
  jobProgressPct = 0,
  jobProgressLabel = null,
  timing = null,
}: ImageStageProps) {
  const [index, setIndex] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const wasBusy = useRef(busy)
  const items: ThumbItem[] = [
    ...(gridUrl ? [{ key: 'grid', src: gridUrl }] : []),
    ...images.map((id) => ({ key: id, src: generationImageUrl(id) })),
  ]
  const current = items[index]
  const many = items.length > 1
  const showPreview = busy && previewUrl

  useEffect(() => {
    if (wasBusy.current && !busy) {
      setIndex(0)
      setLightbox(false)
    }
    wasBusy.current = busy
  }, [busy])

  useEffect(() => {
    if (index >= items.length) {
      setIndex(0)
    }
  }, [index, items.length])

  useEffect(() => {
    if (!lightbox) {
      return
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setLightbox(false)
      }
      if (event.key === 'ArrowLeft' && items.length) {
        setIndex((i) => (i + items.length - 1) % items.length)
      }
      if (event.key === 'ArrowRight' && items.length) {
        setIndex((i) => (i + 1) % items.length)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, items.length])

  return (
    <div className="flex min-w-0 flex-[2] flex-col gap-2">
      <div className="relative aspect-square w-full overflow-hidden rounded-md border border-line bg-panel">
        {showPreview ? (
          <img src={previewUrl} alt="Sampling preview" className="h-full w-full object-contain" />
        ) : current ? (
          <button type="button" className="h-full w-full" onClick={() => setLightbox(true)}>
            <img
              src={current.src}
              alt={current.key === 'grid' ? 'Batch grid' : 'Generated'}
              className="h-full w-full object-contain"
            />
          </button>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">No image yet</div>
        )}
        {busy ? (
          <div className="absolute inset-x-0 top-0 flex flex-col">
            {jobProgressLabel ? <ProgressBar pct={jobProgressPct} label={jobProgressLabel} /> : null}
            <ProgressBar pct={progressPct} label={progressLabel} />
          </div>
        ) : timing ? (
          <div className="pointer-events-none absolute bottom-2 left-2">
            <span className="rounded bg-bg/80 px-2 py-1 text-xs text-ink">{timing}</span>
          </div>
        ) : null}
      </div>
      {many ? <ThumbStrip items={items} index={index} onSelect={setIndex} /> : null}
      {lightbox && current
        ? createPortal(
            <LightboxView
              src={current.src}
              alt={current.key === 'grid' ? 'Batch grid' : 'Generated'}
              resetKey={current.key}
              many={many}
              onClose={() => setLightbox(false)}
              onPrev={() => setIndex((i) => (i + items.length - 1) % items.length)}
              onNext={() => setIndex((i) => (i + 1) % items.length)}
            />,
            document.body,
          )
        : null}
    </div>
  )
}
