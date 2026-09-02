import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { LightboxView } from '@/components/composites/models/LightboxView.tsx'
import { IconButton } from '@/components/controls/button/IconButton.tsx'
import { ProgressBar } from '@/components/controls/progress/ProgressBar.tsx'
import {
  galleryItemImageUrl,
  galleryItemThumbUrl,
  getWorkflows,
  openFolder,
  setGalleryFavorite,
  type JobGalleryItem,
} from '@/lib/api.ts'
import { middleOpen } from '@/lib/gallery/openImage.ts'
import { applySetWorkflow, touchRecent } from '@/stores/generatePersist.ts'
import { mergeParams, pickParams, useGenerateStore, type TemplateParams } from '@/stores/generateStore.ts'
import { toast } from '@/stores/toastStore.ts'
import { GenerationInfo } from '@/views/generate/panels/generation/sections/params/GenerationInfo.tsx'
import { ThumbStrip, type ThumbItem } from '@/views/generate/panels/generation/sections/stage/ThumbStrip.tsx'
import {
  fileFromSrc,
  filenameFromPath,
  outputDirForCurrent,
  outputPathForCurrent,
} from '@/views/generate/panels/generation/sections/stage/stageActions.ts'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { isTyping, overlayOpen } from '@/lib/hotkeys.ts'

type ImageStageProps = {
  images: string[]
  gridUrls: string[]
  gallery?: JobGalleryItem[]
  payload?: Record<string, unknown> | null
  busy: boolean
  previewUrl: string | null
  progressPct: number
  progressLabel: string
  progressSegments?: string[]
  jobProgressPct?: number
  jobProgressLabel?: string | null
  timing?: string | null
  hideInfo?: boolean
}

export function ImageStage({
  images,
  gridUrls,
  gallery = [],
  payload = null,
  busy,
  previewUrl,
  progressPct,
  progressLabel,
  progressSegments,
  jobProgressPct = 0,
  jobProgressLabel = null,
  timing = null,
  hideInfo = false,
}: ImageStageProps) {
  const [index, setIndex] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const [failed, setFailed] = useState<Set<string>>(() => new Set())
  const [previewFailed, setPreviewFailed] = useState(false)
  const [thumbFailed, setThumbFailed] = useState(false)
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const [stars, setStars] = useState<Record<string, boolean>>({})
  const location = useLocation()
  const generate = location.pathname === '/'
  const setViewedImageUrl = useGenerateStore((s) => s.setViewedImageUrl)
  const wasBusy = useRef(busy)
  const heldPreview = useRef<string | null>(null)
  const coverWithPreview = useRef(false)
  const heldFinal = useRef<{ src: string; thumb?: string; key: string } | null>(null)
  const heldInfo = useRef<JobGalleryItem | null>(null)
  const [previewReady, setPreviewReady] = useState(false)
  if (!wasBusy.current && busy) {
    heldPreview.current = null
    coverWithPreview.current = false
  }
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
  if (genInfo) {
    heldInfo.current = genInfo
  }
  const many = items.length > 1
  const ready = Boolean(current?.src && loadedSrc === current.src)
  if (previewUrl) {
    heldPreview.current = previewUrl
    if (busy) {
      coverWithPreview.current = true
    }
  }
  if (ready && !busy) {
    coverWithPreview.current = false
  }
  if (current && ready && !coverWithPreview.current) {
    heldFinal.current = { src: current.src, thumb: current.thumb, key: current.key }
  }
  const previewSrc = previewFailed ? null : previewUrl || (coverWithPreview.current ? heldPreview.current : null)
  const showPreview = Boolean(previewSrc)
  const lastFinal = heldFinal.current
  const previewCovering = showPreview && previewReady
  const hideResults = busy && (showPreview || coverWithPreview.current)
  const showCurrent = Boolean(current) && !hideResults
  const showLastFinal = Boolean(lastFinal) && !showCurrent && !previewCovering
  const coverWithLast = Boolean(lastFinal) && showCurrent && !ready && !previewCovering

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
    if (!wasBusy.current && busy) {
      setPreviewReady(false)
      setPreviewFailed(false)
    }
  if (wasBusy.current && !busy) {
      let focus = 0
      if (gridUrls.length === 0) {
        images.forEach((id, i) => {
          if (gallery.find((item) => item.id === id)?.kind === 'hires') {
            focus = i
          }
        })
      }
      setIndex(focus)
      setLightbox(false)
    }
    wasBusy.current = busy
  }, [busy, gallery, gridUrls.length, images])

  useEffect(() => {
    if (index >= items.length) {
      setIndex(0)
    }
  }, [index, items.length])

  useEffect(() => {
    if (!busy || hideResults || items.length === 0) {
      return
    }
    setIndex(items.length - 1)
  }, [busy, hideResults, items.length])

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
      if (isTyping(event) || overlayOpen() || !current || hideResults) {
        return
      }
      event.preventDefault()
      setLightbox(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, generate, hideResults])

  const actionKey = showCurrent && current ? current.key : showLastFinal && lastFinal ? lastFinal.key : null
  const actionSrc = showCurrent && current ? current.src : showLastFinal && lastFinal ? lastFinal.src : null
  const folder = outputDirForCurrent(payload, actionKey)
  const canSend = Boolean(actionSrc) && !busy && !hideResults
  const showActions = Boolean(actionSrc)
  const favoriteId = actionKey && !actionKey.startsWith('grid-') ? actionKey : null
  const favorited = Boolean(
    favoriteId && (stars[favoriteId] ?? gallery.find((item) => item.id === favoriteId)?.favorite),
  )

  async function toggleFavorite() {
    if (!favoriteId) {
      return
    }
    const next = !favorited
    setStars((prev) => ({ ...prev, [favoriteId]: next }))
    try {
      await setGalleryFavorite(favoriteId, next)
    } catch (err) {
      setStars((prev) => ({ ...prev, [favoriteId]: favorited }))
      toast(err instanceof Error ? err.message : 'Could not favorite', 'error')
    }
  }

  async function revealFolder() {
    if (!folder) {
      return
    }
    try {
      await openFolder(folder)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Folder not found', 'error')
    }
  }

  async function sendTo(extra: 'upscale' | 'rembg') {
    if (!actionSrc || !canSend) {
      return
    }
    try {
      const workflows = await getWorkflows()
      const target = workflows.find((item) => (item.params ?? []).includes(extra))
      if (!target) {
        toast('Workflow not found', 'error')
        return
      }
      const name = filenameFromPath(outputPathForCurrent(payload, actionKey))
      const file = await fileFromSrc(actionSrc, name)
      useGenerateStore.setState((s) => ({
        ...applySetWorkflow(s, target.id, target.defaults, {
          pickParams,
          mergeParams: (raw) => mergeParams(raw as Partial<TemplateParams> | Record<string, unknown> | undefined),
        }),
        recentWorkflowIds: touchRecent(s.recentWorkflowIds, target.id),
      }))
      if (extra === 'upscale') {
        useGenerateStore.getState().setImageUpscale({ inputMode: 'files' })
        useGenerateStore.getState().setImageUpscaleFiles([file])
      } else {
        useGenerateStore.getState().setRembg({ inputMode: 'files' })
        useGenerateStore.getState().setRembgFiles([file])
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not send image', 'error')
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="relative aspect-square w-full overflow-hidden rounded-md border border-line bg-panel">
        {showCurrent && current ? (
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
        ) : showLastFinal && lastFinal ? (
          <button
            type="button"
            className="h-full w-full"
            onMouseDown={(event) => middleOpen(event, lastFinal.src)}
          >
            <img src={lastFinal.src} alt="Generated" className="h-full w-full object-contain" />
          </button>
        ) : showPreview ? null : (
          <div className="flex h-full items-center justify-center text-sm text-muted">No image yet</div>
        )}
        {hideResults && current ? (
          <img
            src={current.src}
            alt=""
            className="hidden"
            onLoad={() => setLoadedSrc(current.src)}
            onError={() => markFailed(current.key)}
          />
        ) : null}
        {coverWithLast && lastFinal ? (
          <img
            src={lastFinal.src}
            alt=""
            className="pointer-events-none absolute inset-0 z-10 h-full w-full object-contain"
          />
        ) : null}
        {showPreview ? (
          <img
            src={previewSrc || undefined}
            alt="Sampling preview"
            className={[
              'pointer-events-none absolute inset-0 z-10 h-full w-full object-contain',
              previewReady ? '' : 'invisible',
            ].join(' ')}
            onLoad={() => setPreviewReady(true)}
            onError={() => setPreviewFailed(true)}
          />
        ) : null}
        {busy ? (
          <div className="absolute inset-x-0 top-0 z-20 flex flex-col">
            {jobProgressLabel ? <ProgressBar pct={jobProgressPct} label={jobProgressLabel} /> : null}
            <ProgressBar pct={progressPct} label={progressLabel} segments={progressSegments} />
          </div>
        ) : timing ? (
          <div className="pointer-events-none absolute bottom-2 left-2 z-20">
            <span className="rounded bg-bg/80 px-2 py-1 text-xs text-ink">{timing}</span>
          </div>
        ) : null}
      </div>
      {many && !hideResults ? <ThumbStrip items={items} index={index} onSelect={setIndex} onError={markFailed} /> : null}
      {showActions ? (
        <div className="flex items-center justify-center gap-cluster">
          <IconButton label disabled={!folder} onClick={() => void revealFolder()}>
            <AppIcon id="folder" />
            Open folder
          </IconButton>
          <IconButton label disabled={!canSend} onClick={() => void sendTo('upscale')}>
            <AppIcon id="scaling" />
            Upscale
          </IconButton>
          <IconButton label disabled={!canSend} onClick={() => void sendTo('rembg')}>
            <AppIcon id="image-minus" />
            Remove background
          </IconButton>
          {favoriteId ? (
            <IconButton label on={favorited} onClick={() => void toggleFavorite()}>
              <AppIcon id="star" className={favorited ? 'fill-current text-yellow' : ''} />
              Favorite
            </IconButton>
          ) : null}
        </div>
      ) : null}
      {hideInfo ? null : <GenerationInfo info={genInfo ?? heldInfo.current} />}
      {lightbox && current && !hideResults ? (
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
