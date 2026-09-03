import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { ContextMenu, ContextMenuItem } from '@/components/composites/chrome/ContextMenu.tsx'
import { ConfirmDialog } from '@/components/controls/dialog/Dialog.tsx'
import { IconButton } from '@/components/controls/button/IconButton.tsx'
import { SegmentSwitch } from '@/components/controls/button/SegmentSwitch.tsx'
import {
  browseThumbUrl,
  clearBrowseHistory,
  listBrowseHistory,
  removeBrowseHistory,
  type BrowseHistoryItem,
} from '@/lib/api/history.ts'
import { openInCivitaiPanel } from '@/lib/civitai/openTab.ts'
import { civitaiModelHref } from '@/lib/civitai/version.ts'
import { DownloadsView } from '@/views/downloads/DownloadsView.tsx'
import { useDownloadsStore } from '@/stores/downloadsStore.ts'
import { toast } from '@/stores/toastStore.ts'
import { civitaiHost, useSettingsStore, type CivitaiSite } from '@/stores/settingsStore.ts'

type Pane = 'history' | 'downloads'

type DayGroup = {
  key: string
  label: string
  items: BrowseHistoryItem[]
}

type CivitaiMenu = {
  x: number
  y: number
  modelId: number
  name: string
  site: string
}

function hostOf(site: string, fallback: CivitaiSite) {
  return civitaiHost(site === 'civitai' || site === 'red' ? site : fallback)
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

function groupByDay(items: BrowseHistoryItem[], query: string) {
  const needle = query.trim().toLowerCase()
  const matched = needle
    ? items.filter((item) => `${item.name} ${item.creator} ${item.type} ${item.searchText}`.toLowerCase().includes(needle))
    : items
  const groups = new Map<string, BrowseHistoryItem[]>()
  for (const item of matched) {
    const key = dayKey(item.viewedAt)
    const list = groups.get(key) || []
    list.push(item)
    groups.set(key, list)
  }
  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([key, rows]) => ({ key, label: dayLabel(key), items: rows }) satisfies DayGroup)
}

function HistoryThumb({
  id,
  megapixels,
  imageFormat,
  videoFormat,
  quality,
}: {
  id: number
  megapixels: number
  imageFormat: string
  videoFormat: string
  quality: number
}) {
  const [mode, setMode] = useState<'img' | 'video' | 'failed'>('img')
  const tries = useRef(0)
  const src = browseThumbUrl(id, megapixels, imageFormat, videoFormat, quality)
  useEffect(() => {
    tries.current = 0
    setMode('img')
  }, [id, megapixels, imageFormat, videoFormat, quality])
  useEffect(() => {
    if (mode !== 'failed' || tries.current >= 3) {
      return
    }
    tries.current += 1
    const timer = window.setTimeout(() => setMode('img'), 1000)
    return () => window.clearTimeout(timer)
  }, [mode, src])
  if (mode === 'failed') {
    return (
      <div className="flex h-20 aspect-[2/3] shrink-0 items-center justify-center rounded bg-field text-muted">
        <AppIcon id="image" size={16} />
      </div>
    )
  }
  const frame = 'h-20 aspect-[2/3] shrink-0 rounded object-cover bg-field'
  if (mode === 'video') {
    return <video src={src} className={frame} muted loop playsInline autoPlay onError={() => setMode('failed')} />
  }
  return <img src={src} alt="" className={frame} onError={() => setMode('video')} />
}

export function HistoryView() {
  const location = useLocation()
  const navigate = useNavigate()
  const [pane, setPane] = useState<Pane>('downloads')
  const [items, setItems] = useState<BrowseHistoryItem[]>([])
  const [busy, setBusy] = useState(true)
  const [query, setQuery] = useState('')
  const [opened, setOpened] = useState<Record<string, boolean>>({})
  const [confirmAll, setConfirmAll] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<BrowseHistoryItem | null>(null)
  const [removeDay, setRemoveDay] = useState<{ label: string; ids: number[] } | null>(null)
  const [menu, setMenu] = useState<CivitaiMenu | null>(null)
  const [dayMenu, setDayMenu] = useState<{ x: number; y: number; key: string; label: string } | null>(null)
  const downloadThumbMegapixels = useSettingsStore((s) => s.downloadThumbMegapixels)
  const downloadThumbImageFormat = useSettingsStore((s) => s.downloadThumbImageFormat)
  const downloadThumbVideoFormat = useSettingsStore((s) => s.downloadThumbVideoFormat)
  const downloadThumbQuality = useSettingsStore((s) => s.downloadThumbQuality)
  const civitaiSite = useSettingsStore((s) => s.civitaiSite)
  const downloadItems = useDownloadsStore((s) => s.items)
  const downloadActive = useDownloadsStore((s) => s.active)
  const downloadQueued = useDownloadsStore((s) => s.queued)
  const downloadBusy = useDownloadsStore((s) => s.busy)
  const clearDownloads = useDownloadsStore((s) => s.clear)
  const tabActive = location.pathname === '/history'
  const days = useMemo(() => groupByDay(items, query), [items, query])
  const firstKey = days[0]?.key ?? ''
  const searching = Boolean(query.trim())
  const empty = items.length === 0
  const downloadsEmpty = downloadItems.length === 0 && downloadActive.length === 0 && downloadQueued.length === 0
  const clearDisabled = pane === 'history' ? busy || empty : downloadBusy || downloadsEmpty

  useEffect(() => {
    if (!tabActive || pane !== 'history') {
      return
    }
    let alive = true
    setBusy(true)
    void listBrowseHistory()
      .then((rows) => {
        if (alive) {
          setItems(rows)
        }
      })
      .catch((err) => {
        toast(err instanceof Error ? err.message : 'Could not load history', 'error')
      })
      .finally(() => {
        if (alive) {
          setBusy(false)
        }
      })
    return () => {
      alive = false
    }
  }, [tabActive, pane])

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
      openInCivitaiPanel({ id: target.modelId, name: target.name })
      navigate('/models')
      return
    }
    window.open(civitaiModelHref(hostOf(target.site, civitaiSite), target.modelId), '_blank', 'noreferrer')
  }

  return (
    <section className="flex h-full min-h-0 flex-col px-10 py-4">
      <div className="mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-cluster">
          <h1 className="text-2xl font-semibold">History</h1>
          <IconButton
            label
            aria-label="Clear list"
            title="Clear list"
            disabled={clearDisabled}
            onClick={() => setConfirmAll(true)}
          >
            <AppIcon id="trash-2" className="text-red" />
            <span className="text-red">Clear list</span>
          </IconButton>
        </div>
        <div className="mt-3 shrink-0">
          <SegmentSwitch
            fill
            value={pane}
            tone="blue"
            options={[
              { id: 'downloads', label: 'Downloads' },
              { id: 'history', label: 'History' },
            ]}
            onChange={setPane}
          />
        </div>
        {pane === 'downloads' ? (
          <DownloadsView embedded active={tabActive} />
        ) : (
          <>
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
                <p className="text-sm text-muted">{busy ? 'Loading…' : 'No viewed models yet.'}</p>
              ) : days.length === 0 ? (
                <p className="text-sm text-muted">No matching pages.</p>
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
                          setDayMenu({ x: event.clientX, y: event.clientY, key: group.key, label: group.label })
                        }}
                      >
                        <button
                          type="button"
                          className="flex w-full items-center justify-between px-3 py-2 text-sm text-ink"
                          onClick={() => setOpened((current) => ({ ...current, [group.key]: !open }))}
                        >
                          <span className="font-medium">{group.label}</span>
                          <span className="text-muted">
                            <AppIcon id={open ? 'chevron-up' : 'chevron-down'} size={12} />
                          </span>
                        </button>
                        {open ? (
                          <div className="flex flex-col gap-1 border-t border-line px-2 py-2">
                            {group.items.map((item) => (
                              <article key={item.id} className="flex items-center gap-2 rounded px-1 py-1">
                                <HistoryThumb
                                  id={item.id}
                                  megapixels={downloadThumbMegapixels}
                                  imageFormat={downloadThumbImageFormat}
                                  videoFormat={downloadThumbVideoFormat}
                                  quality={downloadThumbQuality}
                                />
                                <button
                                  type="button"
                                  className="min-w-0 flex-1 text-left"
                                  onClick={() =>
                                    openCivitai({ x: 0, y: 0, modelId: item.modelId, name: item.name, site: item.site }, true)
                                  }
                                >
                                  <p className="truncate text-sm font-medium text-ink">{item.name || 'Untitled'}</p>
                                  <p className="truncate text-xs text-muted">
                                    {[item.creator, item.type].filter(Boolean).join(' · ')}
                                  </p>
                                </button>
                                <IconButton aria-label="Open in CivitAI"
                                  title="Open in CivitAI"
                                  onClick={(event) =>{
                                    const box = event.currentTarget.getBoundingClientRect()
                                    setDayMenu(null)
                                    setMenu({
                                      x: box.left,
                                      y: box.bottom + 4,
                                      modelId: item.modelId,
                                      name: item.name,
                                      site: item.site,
                                    })
                                  }}
                                >
                                  <AppIcon id="external-link" /></IconButton>
                                <IconButton aria-label="Remove from list"
                                  title="Remove from list"
                                  onClick={() =>setRemoveTarget(item)}
                                >
                                  <AppIcon id="x" /></IconButton>
                              </article>
                            ))}
                          </div>
                        ) : null}
                      </section>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {dayMenu ? (
        <ContextMenu x={dayMenu.x} y={dayMenu.y} onClose={() => setDayMenu(null)}>
          <ContextMenuItem
            label="Remove day"
            danger
            onClick={() => {
              const target = dayMenu
              setDayMenu(null)
              const ids = items.filter((item) => dayKey(item.viewedAt) === target.key).map((item) => item.id)
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
          title={pane === 'history' ? 'Clear browse history?' : 'Clear download history?'}
          body={
            pane === 'history'
              ? 'This removes viewed CivitAI pages and cached icons.'
              : 'This removes the list and cached icons. Downloaded model files are not deleted.'
          }
          onClose={() => setConfirmAll(false)}
          actions={[
            { label: 'Cancel', onClick: () => setConfirmAll(false) },
            {
              label: 'Clear',
              kind: 'primary',
              danger: true,
              onClick: () => {
                setConfirmAll(false)
                if (pane === 'downloads') {
                  void clearDownloads()
                  return
                }
                void clearBrowseHistory()
                  .then(() => setItems([]))
                  .catch((err) => {
                    toast(err instanceof Error ? err.message : 'Could not clear history', 'error')
                  })
              },
            },
          ]}
        />
      ) : null}
      {removeDay ? (
        <ConfirmDialog
          title={`Remove ${removeDay.label}?`}
          body="This removes the list entries and cached icons."
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
                void Promise.all(ids.map((id) => removeBrowseHistory(id)))
                  .then(() => setItems((current) => current.filter((item) => !ids.includes(item.id))))
                  .catch((err) => {
                    toast(err instanceof Error ? err.message : 'Could not remove the day', 'error')
                  })
              },
            },
          ]}
        />
      ) : null}
      {removeTarget ? (
        <ConfirmDialog
          title="Remove this page?"
          body="This removes it from the list and deletes the cached icon."
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
                void removeBrowseHistory(id)
                  .then(() => setItems((current) => current.filter((item) => item.id !== id)))
                  .catch((err) => {
                    toast(err instanceof Error ? err.message : 'Could not remove the page', 'error')
                  })
              },
            },
          ]}
        />
      ) : null}
    </section>
  )
}
