import { GlyphMark } from '@/components/composites/chrome/GlyphMark.tsx'
import { ContextMenu, ContextMenuItem } from '@/components/composites/chrome/ContextMenu.tsx'
import { DownloadedBadge, DownloadingBadge } from '@/components/composites/models/CivitaiDownloadedBadge.tsx'
import { TilePreview } from '@/components/composites/models/TilePreview.tsx'
import type { CivitaiModel } from '@/lib/api.ts'
import { modelMarks } from '@/lib/civitai/marks.ts'
import { civitaiHost, useSettingsStore, type CivitaiSite } from '@/stores/settingsStore.ts'
import { civitaiModelHref, pickVersionId } from '@/lib/civitai/version.ts'
import { useEffect, useRef, useState } from 'react'

const CLICK_WAIT = 280

function BaseMarks({ item }: { item: CivitaiModel }) {
  const table = useSettingsStore((state) => state.civitaiMarks)
  const marks = modelMarks(item, table)
  if (!marks.length) {
    return null
  }
  return (
    <>
      <span aria-hidden="true" className="mx-1.5 h-3.5 w-px shrink-0 bg-ink/60" />
      <span
        className="inline-flex min-w-0 items-center truncate text-ink"
        title={item.baseModels?.join(' · ') || item.baseModel}
      >
        {marks.map((mark, index) => (
          <span key={mark.id} className="inline-flex items-center">
            {index ? <span className="px-1">·</span> : null}
            {mark.icon ? <GlyphMark value={mark.icon} size={12} /> : mark.text}
          </span>
        ))}
      </span>
    </>
  )
}

export function CivitaiTile({
  item,
  nsfw,
  downloaded,
  downloading,
  site,
  preferredBases,
  onOpen,
  onOpenBackground,
  onDownload,
}: {
  item: CivitaiModel
  nsfw: boolean
  downloaded: boolean
  downloading: boolean
  site: CivitaiSite
  preferredBases: string[]
  onOpen: () => void
  onOpenBackground: () => void
  onDownload: () => void
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [thumbReady, setThumbReady] = useState(!item.preview)
  const clickTimer = useRef(0)

  useEffect(() => {
    return () => window.clearTimeout(clickTimer.current)
  }, [])

  useEffect(() => {
    setThumbReady(!item.preview)
  }, [item.preview])

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        className={[
          'group relative aspect-[2/3] min-w-0 cursor-pointer overflow-hidden rounded-md border border-line bg-bg transition hover:border-accent hover:shadow-[0_0_12px_rgb(255_255_255_/_0.12)]',
          downloading ? 'cursor-wait' : '',
        ].join(' ')}
        title={downloading ? `${item.name} · Downloading` : downloaded ? `${item.name} · Already downloaded` : item.name}
        onClick={(event) => {
          if (event.button !== 0 || event.detail > 1) {
            return
          }
          window.clearTimeout(clickTimer.current)
          clickTimer.current = window.setTimeout(onOpen, CLICK_WAIT)
        }}
        onDoubleClick={(event) => {
          event.preventDefault()
          window.clearTimeout(clickTimer.current)
          if (!downloading) {
            onDownload()
          }
        }}
        onMouseDown={(event) => {
          if (event.button === 1) {
            event.preventDefault()
            onOpenBackground()
          }
        }}
        onAuxClick={(event) => {
          if (event.button === 1) {
            event.preventDefault()
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          setMenu({ x: event.clientX, y: event.clientY })
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onOpen()
          }
        }}
      >
        <TilePreview
          src={item.preview || null}
          eager
          className={['absolute inset-0 h-full w-full rounded-none', !nsfw && item.nsfw ? 'scale-110 blur-2xl' : ''].join(
            ' ',
          )}
          onLoad={() => setThumbReady(true)}
          onError={() => setThumbReady(true)}
        />
        {!thumbReady && item.preview ? (
          <div
            className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-bg/20"
            role="status"
            aria-label="Loading thumbnail"
          >
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-muted border-t-ink" />
          </div>
        ) : null}
        {!nsfw && item.nsfw ? (
          <div className="pointer-events-none absolute inset-0 z-10 bg-bg/35 backdrop-blur-2xl" />
        ) : null}
        {downloaded ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-30 overflow-hidden rounded ring-2 ring-inset ring-green"
          >
            <span
              className="absolute inset-0 rounded shadow-[inset_0_0_14px_2px_rgb(64_240_144_/_0.75)] [mask-image:linear-gradient(to_bottom,black_0%,transparent_50%)]"
              aria-hidden="true"
            />
          </div>
        ) : null}
        <div className="pointer-events-none absolute top-2 left-2 right-2 z-20 flex min-w-0 items-center text-[11px] uppercase tracking-wide">
          <span className="inline-flex min-w-0 max-w-full items-center rounded bg-bg/80 px-1.5 py-0.5 text-ink">
            <span className="shrink-0">{item.type || 'Model'}</span>
            <BaseMarks item={item} />
          </span>
        </div>
        {downloaded || downloading || item.paid ? (
          <div className="pointer-events-none absolute top-2 right-2 z-30 flex items-center gap-1">
            {downloading ? <DownloadingBadge /> : null}
            {downloaded ? <DownloadedBadge /> : null}
            {item.paid ? (
              <span
                className="shrink-0 rounded bg-bg/80 px-1.5 py-0.5 tabular-nums normal-case text-ink"
                title={item.buzz ? `${item.buzz} Buzz to download` : 'Not a free download'}
              >
                {item.buzz ? `${item.buzz} Buzz` : 'Paid'}
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-24 bg-gradient-to-t from-bg/95 via-bg/70 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex min-w-0 flex-col px-2 pb-2 text-xs">
          <span className="truncate text-sm text-ink">{item.name}</span>
          {item.creator ? <span className="truncate text-muted">{item.creator}</span> : null}
        </div>
      </div>
      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <ContextMenuItem
            label="View Details"
            icon="square-arrow-out-up-right"
            onClick={() => {
              setMenu(null)
              onOpen()
            }}
          />
          <ContextMenuItem
            label="Download"
            icon="download"
            onClick={() => {
              setMenu(null)
              onDownload()
            }}
          />
          <ContextMenuItem
            label="Open on CivitAI"
            icon="external-link"
            onClick={() => {
              setMenu(null)
              window.open(
                civitaiModelHref(civitaiHost(site), item.id, pickVersionId(item.versions || [], preferredBases)),
                '_blank',
                'noreferrer',
              )
            }}
          />
        </ContextMenu>
      ) : null}
    </>
  )
}
