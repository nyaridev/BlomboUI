import { LightboxView } from '@/components/LightboxView.tsx'
import { ProgressBar } from '@/components/ProgressBar.tsx'
import { galleryItemImageUrl, galleryItemThumbUrl, type JobGalleryItem } from '@/lib/api.ts'
import { middleOpen } from '@/lib/openImage.ts'
import { useGenerateStore } from '@/stores/generateStore.ts'
import { GenerationInfo } from './GenerationInfo.tsx'
import { ThumbStrip, type ThumbItem } from './ThumbStrip.tsx'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { isTyping, overlayOpen } from '@/lib/hotkeys.ts'

type ImageStageProps = {
  images: string[]
  gridUrls: string[]
  gallery?: JobGalleryItem[]
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
  gridUrls,
  gallery = [],
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
  const [failed, setFailed] = useState<Set<string>>(() => new Set())
  const [previewFailed, setPreviewFailed] = useState(false)
  const [thumbFailed, setThumbFailed] = useState(false)
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const location = useLocation()
  const generate = location.pathname === '/'
  const setViewedImageUrl = useGenerateStore((s) => s.setViewedImageUrl)
  const wasBusy = useRef(busy)
  const sourceKey = `${gridUrls.join('\n')}\n${images.join('\n')}`
  const items: ThumbItem[] = [
    ...gridUrls.map((src, i) => ({ key: `grid-${i}`, src })),
    ...images.map((id) => ({
      key: id,
      src: galleryItemImageUrl(id),
      thumb: galleryItemThumbUrl(id),
    })),
  ].filter((item) => !failed.has(item.key))
  const current = items[index]
  const viewingGrid = Boolean(current?.key.startsWith('grid-'))
  const genId = viewingGrid ? images[0] : current?.key
  const genInfo = gallery.find((item) => item.id === genId) ?? null
  const many = items.length > 1
  const showPreview = busy && Boolean(previewUrl) && !previewFailed
  const ready = Boolean(current?.src && loadedSrc === current.src)

  function markFailed(key: string) {
    setFailed((prev) => {
      if (prev.has(key)) {
        return prev
      }
      const next = new Set(prev)
      next.add(key)
      return next
    })
  }

  useEffect(() => {
    setFailed(new Set())
  }, [sourceKey])

  useEffect(() => {
    setPreviewFailed(false)
  }, [previewUrl])

  useEffect(() => {
    setThumbFailed(false)
  }, [current?.thumb])

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
    setViewedImageUrl(current?.src ?? null)
  }, [current?.src, setViewedImageUrl])

  useEffect(() => {
    if (!generate) {
      return
    }
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'f' || event.repeat || event.ctrlKey || event.altKey || event.metaKey) {
        return
      }
      if (isTyping(event) || overlayOpen() || !current) {
        return
      }
      event.preventDefault()
      setLightbox(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, generate])

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="relative aspect-square w-full overflow-hidden rounded-md border border-line bg-panel">
        {showPreview ? (
          <img
            src={previewUrl || undefined}
            alt="Sampling preview"
            className="h-full w-full object-contain"
            onError={() => setPreviewFailed(true)}
          />
        ) : current ? (
          <button
            type="button"
            className="h-full w-full"
            onClick={() => setLightbox(true)}
            onMouseDown={(event) => middleOpen(event, current.src)}
          >
            <span className="relative block h-full w-full">
              {current.thumb && !thumbFailed ? (
                <img
                  src={current.thumb}
                  alt=""
                  className={['absolute inset-0 h-full w-full object-contain', ready ? 'invisible' : ''].join(' ')}
                  decoding="async"
                  onError={() => setThumbFailed(true)}
                />
              ) : null}
              <img
                key={current.key}
                src={current.src}
                alt={current.key.startsWith('grid-') ? 'Batch grid' : 'Generated'}
                className={['h-full w-full object-contain', ready ? '' : 'invisible'].join(' ')}
                fetchPriority="high"
                decoding="async"
                onLoad={() => setLoadedSrc(current.src)}
                onError={() => markFailed(current.key)}
              />
            </span>
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
      {many ? <ThumbStrip items={items} index={index} onSelect={setIndex} onError={markFailed} /> : null}
      {!showPreview ? <GenerationInfo info={genInfo} /> : null}
      {lightbox && current ? (
        <LightboxView
          src={current.src}
          alt={current.key.startsWith('grid-') ? 'Batch grid' : 'Generated'}
          resetKey={current.key}
          many={many}
          onClose={() => setLightbox(false)}
          onPrev={() => setIndex((i) => (i + items.length - 1) % items.length)}
          onNext={() => setIndex((i) => (i + 1) % items.length)}
        />
      ) : null}
    </div>
  )
}
