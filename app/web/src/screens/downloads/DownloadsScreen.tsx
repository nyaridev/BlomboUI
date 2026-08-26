import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { ContextMenu, ContextMenuItem } from '@/components/chrome/ContextMenu.tsx'
import { ConfirmDialog } from '@/components/primitives/Dialog.tsx'
import { DownloadMeter } from '@/components/primitives/DownloadMeter.tsx'
import {
  downloadThumbUrl,
  revealDownload,
  type ActiveDownload,
  type DownloadItem,
  type QueuedDownload,
} from '@/lib/api/downloads.ts'
import { openInCivitaiBrowser } from '@/lib/civitai/openTab.ts'
import { civitaiModelHref } from '@/lib/civitai/version.ts'
import { useDownloadsStore } from '@/stores/downloadsStore.ts'
import { toast } from '@/stores/toastStore.ts'
import { civitaiHost, useSettingsStore, type CivitaiSite } from '@/stores/settingsStore.ts'

const KIND_LABEL: Record<string, string> = {
  checkpoints: 'Checkpoint',
  diffusion_models: 'Diffusion model',
  loras: 'LoRA',
  vae: 'VAE',
  controlnet: 'ControlNet',
  embeddings: 'Embedding',
  wildcards: 'Wildcard',
  text_encoders: 'Text encoder',
}

type FileRow =
  | { status: 'downloading'; item: ActiveDownload; at: number }
  | { status: 'queued'; item: QueuedDownload; at: number }
  | { status: 'done'; item: DownloadItem; at: number }
  | { status: 'failed'; item: DownloadItem; at: number }

type DayGroup = {
  key: string
  label: string
  files: FileRow[]
}

type CivitaiMenu = {
  x: number
  y: number
  modelId: number
  versionId: number
  name: string
  site: string
}

type DayMenu = {
  x: number
  y: number
  key: string
  label: string
}

function hostOf(site: string, fallback: CivitaiSite) {
  return civitaiHost(site === 'civitai' || site === 'red' ? site : fallback)
}

function formatSize(bytes: number) {
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  }
  if (bytes >= 1024 ** 2) {
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  }
  if (bytes >= 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }
  return `${Math.max(0, Math.round(bytes))} B`
}

function formatSpeed(bps: number) {
  if (bps >= 1024 ** 2) {
    return `${(bps / 1024 ** 2).toFixed(1)} MB/s`
  }
  if (bps >= 1024) {
    return `${Math.max(1, Math.round(bps / 1024))} KB/s`
  }
  return `${Math.max(0, Math.round(bps))} B/s`
}

function fileNameOf(row: FileRow) {
  const name = (row.item.fileName ?? '').trim()
  if (name) {
    return name
  }
  if (row.status === 'done' || row.status === 'failed') {
    const path = row.item.paths?.[0] || ''
    return path.split(/[\\/]/).pop() || 'File'
  }
  if (row.status === 'queued') {
    return 'Waiting…'
  }
  return 'Downloading…'
}

function dayKey(unix: number) {
  const date = new Date((unix > 0 ? unix : Date.now() / 1000) * 1000)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function dayLabel(key: string) {
  const now = Date.now() / 1000
  if (key === dayKey(now)) {
    return 'Today'
  }
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (key === dayKey(yesterday.getTime() / 1000)) {
    return 'Yesterday'
  }
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function haystack(item: DownloadItem | ActiveDownload | QueuedDownload) {
  if ((item.searchText ?? '').trim()) {
    return item.searchText
  }
  return [
    item.name,
    item.creator,
    item.fileName,
    item.versionName,
    item.kind,
    item.baseModel,
    ...item.tags,
    ...item.trainedWords,
    item.description,
  ]
    .join(' ')
    .toLowerCase()
}

function matches(item: DownloadItem | ActiveDownload | QueuedDownload, query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return true
  }
  return haystack(item).includes(needle)
}

function groupByDay(
  items: DownloadItem[],
  active: ActiveDownload[],
  queued: QueuedDownload[],
  query: string,
): DayGroup[] {
  const busy = new Set<number>()
  for (const item of [...active, ...queued]) {
    const id = item.historyId
    if (id) {
      busy.add(id)
    }
  }
  const rows: FileRow[] = [
    ...active
      .filter((item) => matches(item, query))
      .map((item) => ({ status: 'downloading' as const, item, at: item.startedAt })),
    ...queued
      .filter((item) => matches(item, query))
      .map((item) => ({ status: 'queued' as const, item, at: item.queuedAt })),
    ...items
      .filter((item) => matches(item, query) && !busy.has(item.id))
      .map((item) =>
        item.status === 'failed'
          ? { status: 'failed' as const, item, at: item.createdAt }
          : { status: 'done' as const, item, at: item.createdAt },
      ),
  ]
  rows.sort((a, b) => b.at - a.at)
  const groups = new Map<string, DayGroup>()
  for (const row of rows) {
    const key = dayKey(row.at)
    const existing = groups.get(key)
    if (existing) {
      existing.files.push(row)
      continue
    }
    groups.set(key, { key, label: dayLabel(key), files: [row] })
  }
  return [...groups.values()]
}

function removableIdsForDay(
  items: DownloadItem[],
  active: ActiveDownload[],
  queued: QueuedDownload[],
  key: string,
) {
  const busy = new Set<number>()
  for (const item of [...active, ...queued]) {
    const id = item.historyId
    if (id) {
      busy.add(id)
    }
  }
  return items.filter((item) => dayKey(item.createdAt) === key && !busy.has(item.id)).map((item) => item.id)
}

function thumbIdOf(row: FileRow) {
  if (row.status === 'done' || row.status === 'failed') {
    return row.item.id || null
  }
  return row.item.historyId ?? null
}

function DownloadThumb({
  id,
  megapixels,
  imageFormat,
  videoFormat,
  quality,
  retry = false,
}: {
  id: number
  megapixels: number
  imageFormat: string
  videoFormat: string
  quality: number
  retry?: boolean
}) {
  const [mode, setMode] = useState<'img' | 'video' | 'failed'>('img')
  const src = downloadThumbUrl(id, megapixels, imageFormat, videoFormat, quality)
  useEffect(() => {
    setMode('img')
  }, [id, megapixels, imageFormat, videoFormat, quality])
  useEffect(() => {
    if (mode !== 'failed' || !retry) {
      return
    }
    const timer = window.setTimeout(() => setMode('img'), 1000)
    return () => window.clearTimeout(timer)
  }, [mode, retry, src])
  if (mode === 'failed') {
    return (
      <div className="flex h-20 aspect-[2/3] shrink-0 items-center justify-center rounded bg-field text-muted">
        <AppIcon id="image" size={16} />
      </div>
    )
  }
  const frame = 'h-20 aspect-[2/3] shrink-0 rounded object-cover bg-field'
  if (mode === 'video') {
    return (
      <video
        src={src}
        className={frame}
        muted
        loop
        playsInline
        autoPlay
        onError={() => setMode('failed')}
      />
    )
  }
  return <img src={src} alt="" className={frame} onError={() => setMode('video')} />
}

export function DownloadsScreen({
  embedded = false,
  active,
}: {
  embedded?: boolean
  active?: boolean
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const items = useDownloadsStore((s) => s.items)
  const activeItems = useDownloadsStore((s) => s.active)
  const queuedItems = useDownloadsStore((s) => s.queued)
  const busy = useDownloadsStore((s) => s.busy)
  const load = useDownloadsStore((s) => s.load)
  const clear = useDownloadsStore((s) => s.clear)
  const remove = useDownloadsStore((s) => s.remove)
  const removeMany = useDownloadsStore((s) => s.removeMany)
  const retry = useDownloadsStore((s) => s.retry)
  const downloadThumbMegapixels = useSettingsStore((s) => s.downloadThumbMegapixels)
  const downloadThumbImageFormat = useSettingsStore((s) => s.downloadThumbImageFormat)
  const downloadThumbVideoFormat = useSettingsStore((s) => s.downloadThumbVideoFormat)
  const downloadThumbQuality = useSettingsStore((s) => s.downloadThumbQuality)
  const civitaiSite = useSettingsStore((s) => s.civitaiSite)
  const [query, setQuery] = useState('')
  const [opened, setOpened] = useState<Record<string, boolean>>({})
  const [confirmAll, setConfirmAll] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<DownloadItem | null>(null)
  const [removeDay, setRemoveDay] = useState<{ label: string; ids: number[] } | null>(null)
  const [menu, setMenu] = useState<CivitaiMenu | null>(null)
  const [dayMenu, setDayMenu] = useState<DayMenu | null>(null)
  const tabActive = active ?? location.pathname === '/downloads'
  const days = useMemo(
    () => groupByDay(items, activeItems, queuedItems, query),
    [items, activeItems, queuedItems, query],
  )
  const firstKey = days[0]?.key ?? ''
  const searching = Boolean(query.trim())
  const empty = items.length === 0 && activeItems.length === 0 && queuedItems.length === 0

  useEffect(() => {
    if (!tabActive) {
      return
    }
    void load()
    const id = window.setInterval(() => {
      void load({ silent: true })
    }, 500)
    return () => window.clearInterval(id)
  }, [tabActive, load])

  function isOpen(key: string) {
    if (searching) {
      return true
    }
    if (key in opened) {
      return opened[key]
    }
    return key === firstKey
  }

  function openCivitai(target: CivitaiMenu, local: boolean) {
    if (local) {
      openInCivitaiBrowser({ id: target.modelId, name: target.name }, target.versionId)
      navigate('/models')
      return
    }
    window.open(
      civitaiModelHref(hostOf(target.site, civitaiSite), target.modelId, target.versionId),
      '_blank',
      'noreferrer',
    )
  }

  async function reveal(item: DownloadItem) {
    try {
      await revealDownload(item.id)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not open in Explorer', 'error')
    }
  }

  return (
    <section className={embedded ? 'flex min-h-0 flex-1 flex-col' : 'flex h-full min-h-0 flex-col px-10 py-4'}>
      <div className={embedded ? 'flex min-h-0 flex-1 flex-col' : 'mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col'}>
        {embedded ? null : (
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">Downloads</h1>
            <button
              type="button"
              className="icon-btn text-red"
              aria-label="Clear list"
              title="Clear list"
              disabled={busy || items.length === 0}
              onClick={() => setConfirmAll(true)}
            >
              <AppIcon id="trash-2" />
            </button>
          </div>
        )}
        <div className="relative mt-3 h-8 shrink-0">
          <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-muted">
            <AppIcon id="search" size={12} />
          </span>
          <input
            className="h-full w-full rounded border border-line bg-field py-0 pr-2 pl-7 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search…"
          />
        </div>
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {empty ? (
            <p className="text-sm text-muted">{busy ? 'Loading…' : 'No downloads yet.'}</p>
          ) : days.length === 0 ? (
            <p className="text-sm text-muted">No matching downloads.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {days.map((group) => {
                const open = isOpen(group.key)
                return (
                  <section
                    key={group.key}
                    className="rounded-md border border-line bg-panel"
                    onContextMenu={(event) => {
                      event.preventDefault()
                      setMenu(null)
                      setDayMenu({
                        x: event.clientX,
                        y: event.clientY,
                        key: group.key,
                        label: group.label,
                      })
                    }}
                  >
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-sm text-ink"
                      onClick={() => setOpened((prev) => ({ ...prev, [group.key]: !open }))}
                    >
                      <span className="font-medium">{group.label}</span>
                      <span className="text-muted">
                        <AppIcon id={open ? 'chevron-up' : 'chevron-down'} size={12} />
                      </span>
                    </button>
                    {open ? (
                      <div className="flex flex-col gap-1 border-t border-line px-2 py-2">
                        {group.files.map((row) => {
                          const thumbId = thumbIdOf(row)
                          return (
                          <article
                            key={
                              row.status === 'done' || row.status === 'failed' ? row.item.id : row.item.key
                            }
                            className="flex items-center gap-2 rounded px-1 py-1"
                          >
                            {thumbId ? (
                              <DownloadThumb
                                id={thumbId}
                                megapixels={downloadThumbMegapixels}
                                imageFormat={downloadThumbImageFormat}
                                videoFormat={downloadThumbVideoFormat}
                                quality={downloadThumbQuality}
                                retry={row.status === 'downloading' || row.status === 'queued'}
                              />
                            ) : (
                              <div className="flex h-20 aspect-[2/3] shrink-0 items-center justify-center rounded bg-field text-muted">
                                <AppIcon id="image" size={16} />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-ink">{row.item.name || 'Untitled'}</p>
                              <p className="truncate text-xs text-muted">
                                {[
                                  fileNameOf(row),
                                  row.item.creator,
                                  KIND_LABEL[row.item.kind] || row.item.kind,
                                  row.item.versionName,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </p>
                              {row.status === 'downloading' ? (
                                <div className="mt-1.5">
                                  <DownloadMeter
                                    pct={
                                      row.item.sizeBytes > 0
                                        ? Math.min(100, (row.item.bytesDone / row.item.sizeBytes) * 100)
                                        : 0
                                    }
                                    label={[
                                      row.item.sizeBytes > 0
                                        ? `${formatSize(row.item.bytesDone)} / ${formatSize(row.item.sizeBytes)}`
                                        : formatSize(row.item.bytesDone),
                                      formatSpeed(row.item.speedBps),
                                    ]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  />
                                </div>
                              ) : row.status === 'queued' ? (
                                <p className="truncate text-xs text-muted">Waiting</p>
                              ) : row.status === 'failed' ? (
                                <p className="truncate text-xs text-red">{row.item.error || 'Download failed'}</p>
                              ) : row.item.sizeBytes ? (
                                <p className="truncate text-xs text-muted">{formatSize(row.item.sizeBytes)}</p>
                              ) : null}
                            </div>
                            {row.status === 'failed' ? (
                              <button
                                type="button"
                                className="icon-btn"
                                aria-label="Retry download"
                                title="Retry download"
                                onClick={() => {
                                  void retry(row.item.id).catch((err) => {
                                    toast(err instanceof Error ? err.message : 'Could not retry the download', 'error')
                                  })
                                }}
                              >
                                <AppIcon id="refresh-cw" />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="icon-btn"
                              aria-label="Open in CivitAI"
                              title="Open in CivitAI"
                              onClick={(event) => {
                                const box = event.currentTarget.getBoundingClientRect()
                                setDayMenu(null)
                                setMenu({
                                  x: box.left,
                                  y: box.bottom + 4,
                                  modelId: row.item.modelId,
                                  versionId: row.item.versionId,
                                  name: row.item.name,
                                  site: row.item.site,
                                })
                              }}
                            >
                              <AppIcon id="external-link" />
                            </button>
                            <button
                              type="button"
                              className="icon-btn"
                              aria-label="Open in Explorer"
                              title="Open in Explorer"
                              disabled={row.status !== 'done' || !row.item.paths.length}
                              onClick={() => row.status === 'done' && void reveal(row.item)}
                            >
                              <AppIcon id="folder" />
                            </button>
                            <button
                              type="button"
                              className="icon-btn"
                              aria-label="Remove from list"
                              title="Remove from list"
                              disabled={row.status !== 'done' && row.status !== 'failed'}
                              onClick={() =>
                                (row.status === 'done' || row.status === 'failed') && setRemoveTarget(row.item)
                              }
                            >
                              <AppIcon id="x" />
                            </button>
                          </article>
                          )
                        })}
                      </div>
                    ) : null}
                  </section>
                )
              })}
            </div>
          )}
        </div>
      </div>
      {dayMenu ? (
        <ContextMenu x={dayMenu.x} y={dayMenu.y} onClose={() => setDayMenu(null)}>
          <ContextMenuItem
            label="Remove day"
            danger
            onClick={() => {
              const target = dayMenu
              setDayMenu(null)
              const ids = removableIdsForDay(items, activeItems, queuedItems, target.key)
              if (!ids.length) {
                toast('Active downloads stay in the list until they finish')
                return
              }
              setRemoveDay({ label: target.label, ids })
            }}
          />
        </ContextMenu>
      ) : null}
      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <ContextMenuItem
            label="Local"
            icon="square-arrow-out-up-right"
            onClick={() => {
              const target = menu
              setMenu(null)
              openCivitai(target, true)
            }}
          />
          <ContextMenuItem
            label="Website"
            icon="external-link"
            onClick={() => {
              const target = menu
              setMenu(null)
              openCivitai(target, false)
            }}
          />
        </ContextMenu>
      ) : null}
      {confirmAll ? (
        <ConfirmDialog
          title="Clear download history?"
          body="This removes the list and cached icons. Downloaded model files are not deleted."
          onClose={() => setConfirmAll(false)}
          actions={[
            { label: 'Cancel', onClick: () => setConfirmAll(false) },
            {
              label: 'Clear',
              kind: 'primary',
              danger: true,
              onClick: () => {
                setConfirmAll(false)
                void clear()
              },
            },
          ]}
        />
      ) : null}
      {removeDay ? (
        <ConfirmDialog
          title={`Remove ${removeDay.label}?`}
          body="This removes the list entries and cached icons. Downloaded model files are not deleted."
          onClose={() => setRemoveDay(null)}
          actions={[
            { label: 'Cancel', onClick: () => setRemoveDay(null) },
            {
              label: 'Remove',
              kind: 'primary',
              danger: true,
              onClick: () => {
                const ids = removeDay.ids
                setRemoveDay(null)
                void removeMany(ids).catch((err) => {
                  toast(err instanceof Error ? err.message : 'Could not remove the day', 'error')
                })
              },
            },
          ]}
        />
      ) : null}
      {removeTarget ? (
        <ConfirmDialog
          title="Remove this download?"
          body="This removes it from the list and deletes the cached icon. The model file on disk is not deleted."
          onClose={() => setRemoveTarget(null)}
          actions={[
            { label: 'Cancel', onClick: () => setRemoveTarget(null) },
            {
              label: 'Remove',
              kind: 'primary',
              danger: true,
              onClick: () => {
                const id = removeTarget.id
                setRemoveTarget(null)
                void remove(id)
              },
            },
          ]}
        />
      ) : null}
    </section>
  )
}
