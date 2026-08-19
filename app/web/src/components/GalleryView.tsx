import { Chevron } from '@/components/Chevron.tsx'
import { ConfirmDialog } from '@/components/Dialog.tsx'
import { DownloadIcon } from '@/components/DownloadIcon.tsx'
import { buildGalleryTree, dirExists, type GalleryNode } from '@/lib/galleryTree.ts'
import { InfoIcon } from '@/components/InfoIcon.tsx'
import { ModelInfoDialog } from '@/components/ModelInfoDialog.tsx'
import { PaneSplitter } from '@/components/PaneSplitter.tsx'
import { RefreshIcon } from '@/components/RefreshIcon.tsx'
import { SelectField } from '@/components/SelectField.tsx'
import { TilePreview } from '@/components/TilePreview.tsx'
import { modelLabel, modelPath, useModelsStore } from '@/stores/modelsStore.ts'
import { useSettingsStore, type GalleryViewKind } from '@/stores/settingsStore.ts'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { modelThumbUrl, type CivitaiVersion, type ModelEntry, type ModelLists } from '@/lib/api.ts'
import { applyCivitaiMeta, civitaiHashes, hasCivitaiLocalData, lookupCivitai, waitModelInfo } from '@/lib/civitaiFill.ts'

const TREE_REM = 18
const TREE_MIN_REM = 12
const TILE_COL_REM = 16
const TILE_ROW_REM = 24
const GALLERY_ROWS = 2
const TILE_GAP_REM = 1
const TILE_PAD_REM = 1

export const GALLERY_SORTS = [
  { value: 'name', label: 'Name' },
  { value: 'added', label: 'Date Created' },
  { value: 'edited', label: 'Date Modified' },
  { value: 'path', label: 'Path' },
] as const

export type GallerySortKey = (typeof GALLERY_SORTS)[number]['value']
export type GallerySortDir = 'asc' | 'desc'

type SortKey = GallerySortKey
type SortDir = GallerySortDir

type GalleryChrome = {
  query: string
  sortKey?: SortKey
  sortDir?: SortDir
  showTree: boolean
  treeWidth: number
  openDirs: string[]
  treeScroll: number
  tileScroll: number
}

const chrome = new Map<string, GalleryChrome>()

type GalleryViewProps = {
  kind: keyof ModelLists
  items: ModelEntry[]
  value?: string
  selected?: string[]
  onSelect?: (id: string) => void
}

function remPx() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

function SearchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <circle cx="5" cy="5" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7.4 7.4 10.2 10.2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M1.5 3.5h4l1 1.5h6v6.5h-11z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function FileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M4 1.5h4.5L11.5 5v7.5H4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M8.5 1.5V5H11.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

function TreeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="5" y="1.5" width="4" height="3" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M7 4.5v2M4 8.5V6.5h6v2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="1.5" y="8.5" width="4" height="3" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="8.5" y="8.5" width="4" height="3" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function SortDirIcon({ dir }: { dir: SortDir }) {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M4 6.2 7 3.2 10 6.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={dir === 'asc' ? 1 : 0.35}
      />
      <path
        d="M4 7.8 7 10.8 10 7.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={dir === 'desc' ? 1 : 0.35}
      />
    </svg>
  )
}

function rowClass(on: boolean) {
  return [
    'flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
    on ? 'bg-line text-ink' : 'text-muted hover:bg-field hover:text-ink',
  ].join(' ')
}

function fileName(path: string) {
  return modelLabel(path.split(/[\\/]/).pop() || path)
}

function treePath(item: ModelEntry) {
  return (item.tag || item.path).replace(/\\/g, '/')
}

function filePath(item: ModelEntry) {
  return item.source || item.path.split('#')[0] || item.path
}

function tileName(item: ModelEntry) {
  return item.label || item.tag || fileName(item.path)
}

function matchesQuery(item: ModelEntry, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) {
    return true
  }
  const tag = treePath(item).toLowerCase()
  const path = item.path.replace(/\\/g, '/').toLowerCase()
  if (tag === q || tag.startsWith(`${q}/`) || path === q || path.startsWith(`${q}/`)) {
    return true
  }
  return (
    path.includes(q) ||
    tag.includes(q) ||
    fileName(item.path).toLowerCase().includes(q) ||
    (item.label || '').toLowerCase().includes(q)
  )
}

function sortItems(items: ModelEntry[], key: SortKey, dir: SortDir) {
  const next = [...items]
  next.sort((a, b) => {
    if (key === 'added' || key === 'edited') {
      const delta = a[key] - b[key]
      if (delta !== 0) {
        return delta
      }
    }
    const av = key === 'path' ? a.path : tileName(a)
    const bv = key === 'path' ? b.path : tileName(b)
    return av.localeCompare(bv, undefined, { sensitivity: 'base' })
  })
  if (dir === 'desc') {
    next.reverse()
  }
  return next
}

export function GalleryView({ kind, items, value, selected, onSelect }: GalleryViewProps) {
  const saved = chrome.get(kind)
  const sortKind: GalleryViewKind = kind === 'loras' || kind === 'wildcards' ? kind : 'checkpoints'
  const gallerySortKey = useSettingsStore((s) => s.gallerySortKey[sortKind])
  const gallerySortDir = useSettingsStore((s) => s.gallerySortDir[sortKind])
  const tileScale = useSettingsStore((s) => s.galleryTileScale)
  const rowRef = useRef<HTMLDivElement>(null)
  const treeRef = useRef<HTMLDivElement>(null)
  const tilesRef = useRef<HTMLDivElement>(null)
  const [treeWidth, setTreeWidth] = useState(() => saved?.treeWidth ?? TREE_REM * 16)
  const [openDirs, setOpenDirs] = useState<Set<string>>(() => new Set(saved?.openDirs))
  const [showTree, setShowTree] = useState(() => saved?.showTree ?? true)
  const [query, setQuery] = useState(() => saved?.query ?? '')
  const [sortKey, setSortKey] = useState<SortKey | null>(saved?.sortKey ?? null)
  const [sortDir, setSortDir] = useState<SortDir | null>(saved?.sortDir ?? null)
  const [infoItem, setInfoItem] = useState<ModelEntry | null>(null)
  const [fillConfirm, setFillConfirm] = useState<{ path: string; hit: CivitaiVersion } | null>(null)
  const [filling, setFilling] = useState<string | null>(null)
  const shownSortKey = sortKey ?? gallerySortKey
  const shownSortDir = sortDir ?? gallerySortDir
  const tileW = TILE_COL_REM * tileScale
  const tileH = TILE_ROW_REM * tileScale
  const snap = useRef({
    query,
    sortKey: sortKey ?? undefined,
    sortDir: sortDir ?? undefined,
    showTree,
    treeWidth,
    openDirs,
    treeScroll: saved?.treeScroll ?? 0,
    tileScroll: saved?.tileScroll ?? 0,
  })
  snap.current = {
    ...snap.current,
    query,
    sortKey: sortKey ?? undefined,
    sortDir: sortDir ?? undefined,
    showTree,
    treeWidth,
    openDirs,
  }
  const busy = useModelsStore((s) => s.busy)
  const refreshKind = useModelsStore((s) => s.refreshKind)
  const setThumb = useModelsStore((s) => s.setThumb)
  const setMeta = useModelsStore((s) => s.setMeta)
  const paths = useMemo(() => items.map(treePath).filter(Boolean), [items])
  const byTree = useMemo(() => new Map(items.map((item) => [treePath(item), item])), [items])
  const tree = useMemo(() => buildGalleryTree(paths), [paths])
  const tiles = useMemo(() => {
    return sortItems(
      items.filter((item) => modelPath(item) && matchesQuery(item, query)),
      shownSortKey,
      shownSortDir,
    )
  }, [items, query, shownSortKey, shownSortDir])

  function isOn(path: string) {
    if (selected) {
      return selected.includes(path)
    }
    return Boolean(onSelect) && value === path
  }

  async function saveCivitai(path: string, hit: CivitaiVersion) {
    const info = await waitModelInfo(kind, path)
    const next = await applyCivitaiMeta(kind, path, hit, { types: info.types || [], prompt: info.prompt || '' })
    if (next.thumb) {
      setThumb(kind, path, next.thumb)
    }
    if (kind === 'loras') {
      setMeta(kind, path, { prompt: next.prompt })
    }
  }

  async function downloadCivitai(path: string) {
    if (filling) {
      return
    }
    setFilling(path)
    try {
      const info = await waitModelInfo(kind, path)
      const hit = await lookupCivitai(civitaiHashes(info))
      if (!hit) {
        return
      }
      if (hasCivitaiLocalData(info, kind === 'loras')) {
        setFillConfirm({ path, hit })
        return
      }
      await saveCivitai(path, hit)
    } catch {
      /* keep current */
    } finally {
      setFilling(null)
    }
  }

  useEffect(() => {
    if (saved?.treeWidth) {
      return
    }
    setTreeWidth(TREE_REM * remPx())
  }, [saved?.treeWidth])

  useLayoutEffect(() => {
    const yTree = saved?.treeScroll ?? 0
    const yTiles = saved?.tileScroll ?? 0
    function apply() {
      if (treeRef.current) {
        treeRef.current.scrollTop = yTree
      }
      if (tilesRef.current) {
        tilesRef.current.scrollTop = yTiles
      }
    }
    apply()
    const frame = window.requestAnimationFrame(apply)
    return () => window.cancelAnimationFrame(frame)
  }, [kind, tiles.length, saved?.treeScroll, saved?.tileScroll])

  useEffect(() => {
    if (treeRef.current) {
      treeRef.current.scrollTop = saved?.treeScroll ?? 0
    }
    if (tilesRef.current) {
      tilesRef.current.scrollTop = saved?.tileScroll ?? 0
    }
  }, [kind, tiles.length, saved?.treeScroll, saved?.tileScroll])

  useLayoutEffect(() => {
    return () => {
      const now = snap.current
      chrome.set(kind, {
        query: now.query,
        sortKey: now.sortKey,
        sortDir: now.sortDir,
        showTree: now.showTree,
        treeWidth: now.treeWidth,
        openDirs: [...now.openDirs],
        treeScroll: treeRef.current?.scrollTop ?? now.treeScroll,
        tileScroll: tilesRef.current?.scrollTop ?? now.tileScroll,
      })
    }
  }, [kind])

  useEffect(() => {
    setOpenDirs((current) => {
      const next = new Set<string>()
      for (const path of current) {
        if (dirExists(paths, path)) {
          next.add(path)
        }
      }
      return next.size === current.size ? current : next
    })
  }, [paths])

  function clickDir(path: string) {
    const open = openDirs.has(path)
    const same = query.trim() === path
    if (!open) {
      setOpenDirs((current) => new Set(current).add(path))
      setQuery(path)
      return
    }
    if (same) {
      setOpenDirs((current) => {
        const next = new Set(current)
        next.delete(path)
        return next
      })
      setQuery('')
      return
    }
    setQuery(path)
  }

  function renderNode(node: GalleryNode) {
    if (node.kind === 'file') {
      const item = byTree.get(node.path)
      const selected = isOn(item?.path || node.path)
      const label = item ? tileName(item) : node.name
      return (
        <div key={node.path} title={node.path} className={rowClass(selected)}>
          <span className="w-4 shrink-0" />
          <span className="shrink-0 text-muted">
            <FileIcon />
          </span>
          <span className="truncate">{label}</span>
        </div>
      )
    }
    const open = openDirs.has(node.path)
    const on = query.trim() === node.path
    return (
      <div
        key={node.path}
        className={[
          'shrink-0 rounded-md border',
          on ? 'border-accent' : 'border-line',
          open ? 'bg-field' : 'bg-transparent',
        ].join(' ')}
      >
        <button
          type="button"
          title={node.path}
          className={rowClass(on)}
          onClick={() => clickDir(node.path)}
        >
          <span className="flex h-4 w-4 shrink-0 items-center justify-center">
            <Chevron dir={open ? 'down' : 'right'} size={10} />
          </span>
          <span className="shrink-0">
            <FolderIcon />
          </span>
          <span className="truncate font-medium">{node.name}</span>
        </button>
        {open ? (
          <div className="flex flex-col gap-1 border-t border-line p-1.5 pl-3">
            {node.children.map((child) => renderNode(child))}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-8 shrink-0 items-stretch gap-1">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-muted">
            <SearchIcon />
          </span>
          <input
            className="h-full w-full rounded border border-line bg-field py-0 pr-2 pl-7 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
          />
        </div>
        <div className="flex h-full w-40 shrink-0 [&>div]:h-full [&>div]:w-full [&_.field-select]:h-full [&_.field-select]:py-0">
          <SelectField
            value={shownSortKey}
            onChange={(value) => {
              setSortKey(value as SortKey)
              setSortDir(shownSortDir)
            }}
            options={[...GALLERY_SORTS]}
          />
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label={shownSortDir === 'asc' ? 'Ascending' : 'Descending'}
          title={shownSortDir === 'asc' ? 'Ascending' : 'Descending'}
          onClick={() => {
            setSortKey(shownSortKey)
            setSortDir(shownSortDir === 'asc' ? 'desc' : 'asc')
          }}
        >
          <SortDirIcon dir={shownSortDir} />
        </button>
        <button
          type="button"
          className={['icon-btn', showTree ? 'bg-line' : ''].join(' ')}
          aria-label={showTree ? 'Hide tree' : 'Show tree'}
          aria-pressed={showTree}
          title={showTree ? 'Hide tree' : 'Show tree'}
          onClick={() => setShowTree((on) => !on)}
        >
          <TreeIcon />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Refresh models"
          title="Refresh models (R)"
          disabled={busy}
          onClick={() => void refreshKind(kind)}
        >
          <RefreshIcon />
        </button>
      </div>
      <div
        ref={rowRef}
        className="flex min-h-0 flex-1 select-none"
        style={{ minHeight: `${GALLERY_ROWS * tileH + TILE_GAP_REM + TILE_PAD_REM}rem` }}
      >
        {showTree ? (
          <>
            <div
              ref={treeRef}
              className="flex min-h-0 shrink-0 flex-col gap-1.5 overflow-y-auto pr-1"
              style={{ width: treeWidth }}
              onScroll={(event) => {
                snap.current.treeScroll = event.currentTarget.scrollTop
              }}
            >
              {tree.map((node) => renderNode(node))}
            </div>
            <PaneSplitter
              value={treeWidth}
              onChange={setTreeWidth}
              onReset={() => setTreeWidth(TREE_REM * remPx())}
              min={TREE_MIN_REM * remPx()}
              containerRef={rowRef}
            />
          </>
        ) : null}
        <div
          ref={tilesRef}
          className="min-h-0 min-w-0 flex-1 overflow-y-auto p-2"
          onScroll={(event) => {
            snap.current.tileScroll = event.currentTarget.scrollTop
          }}
        >
          {tiles.length === 0 ? (
            <p className="text-xs text-muted">No items.</p>
          ) : (
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${tileW}rem, 1fr))` }}
            >
              {tiles.map((item) => {
                const selected = isOn(item.path)
                const preview = (
                  <TilePreview
                    className="w-full"
                    src={item.thumb ? modelThumbUrl(kind, filePath(item), item.thumb) : null}
                    mark="?"
                    label={tileName(item)}
                  />
                )
                return (
                  <div
                    key={item.path}
                    className="group relative min-w-0 [content-visibility:auto]"
                    style={{ containIntrinsicSize: `${tileW}rem ${tileH}rem` }}
                  >
                    {onSelect ? (
                      <button
                        type="button"
                        title={item.path}
                        className={['w-full rounded', selected ? 'ring-2 ring-ink ring-offset-2 ring-offset-panel' : ''].join(' ')}
                        onClick={() => onSelect(item.path)}
                      >
                        {preview}
                      </button>
                    ) : (
                      <div title={item.path} className="w-full rounded">
                        {preview}
                      </div>
                    )}
                    <div className="absolute top-2 right-2 z-20 flex gap-1 opacity-0 group-hover:opacity-100">
                      {kind !== 'wildcards' && filePath(item).toLowerCase().endsWith('.safetensors') ? (
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label="Download from Civitai"
                          title="Download from Civitai"
                          disabled={filling === filePath(item)}
                          onClick={() => void downloadCivitai(filePath(item))}
                        >
                          <DownloadIcon />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Model settings"
                        title="Model settings"
                        onClick={() => setInfoItem({ ...item, path: filePath(item) })}
                      >
                        <InfoIcon />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      {infoItem ? (
        <ModelInfoDialog
          kind={kind}
          item={infoItem}
          onClose={() => setInfoItem(null)}
          onSaved={(thumb) => {
            setThumb(kind, infoItem.path, thumb)
            setInfoItem({ ...infoItem, thumb })
          }}
        />
      ) : null}
      {fillConfirm ? (
        <ConfirmDialog
          title="Replace existing data?"
          body={
            kind === 'loras'
              ? 'Thumbnail, model type, or trigger words are already set. Download from Civitai anyway?'
              : 'Thumbnail or model type is already set. Download from Civitai anyway?'
          }
          onClose={() => setFillConfirm(null)}
          actions={[
            { label: 'Cancel', onClick: () => setFillConfirm(null) },
            {
              label: 'Replace',
              kind: 'primary',
              onClick: () => {
                const next = fillConfirm
                setFillConfirm(null)
                setFilling(next.path)
                void saveCivitai(next.path, next.hit).finally(() => setFilling(null))
              },
            },
          ]}
        />
      ) : null}
    </div>
  )
}
