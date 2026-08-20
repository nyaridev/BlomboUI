import { AppIcon } from '@/components/AppIcon.tsx'
import { ConfirmDialog } from '@/components/Dialog.tsx'
import { ContextMenu, ContextMenuItem } from '@/components/ContextMenu.tsx'
import { LOCAL_ID } from '@/components/FolderList.tsx'
import { GalleryCreateFolderDialog, GalleryRenameDialog } from '@/components/GalleryDialogs.tsx'
import { GalleryTree } from '@/components/GalleryTree.tsx'
import {
  buildGalleryTree,
  collectDirPaths,
  dirExists,
  displayToIdent,
  identToDisplay,
  LOCAL_DIR,
  parentIdent,
  scopeRoot,
  siblingNames,
  toDisplayRoots,
  treeDisplayPath,
} from '@/lib/galleryTree.ts'
import { ModelInfoDialog } from '@/components/ModelInfoDialog.tsx'
import { PaneSplitter } from '@/components/PaneSplitter.tsx'
import { SelectField } from '@/components/SelectField.tsx'
import { ThumbnailScopePicker } from '@/components/ThumbnailScopePicker.tsx'
import { TilePreview } from '@/components/TilePreview.tsx'
import { civitaiSaveThumbView, modelThumbSrc } from '@/lib/thumbView.ts'
import { modelLabel, modelPath, useModelsStore } from '@/stores/modelsStore.ts'
import { useSettingsStore, type GalleryViewKind } from '@/stores/settingsStore.ts'
import { useThumbView } from '@/stores/thumbnailScopeStore.ts'
import { toast } from '@/stores/toastStore.ts'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createModelFolder,
  createWildcardFolder,
  getModelTree,
  getWildcardTree,
  moveModelEntry,
  moveWildcardEntry,
  renameModelEntry,
  renameWildcardEntry,
  removeEntry as trashEntry,
  revealModelFile,
  revealWildcardFile,
  type CivitaiVersion,
  type ModelEntry,
  type ModelLists,
} from '@/lib/api.ts'
import { applyCivitaiMeta, civitaiHashes, hasCivitaiLocalData, lookupCivitai, waitModelInfo } from '@/lib/civitaiFill.ts'
import { storedLoraStrengthLabel } from '@/lib/loraTags.ts'

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
  pinSelected: boolean
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

function remapPrefix(path: string, from: string, to: string) {
  if (path === from) {
    return to
  }
  if (from && path.startsWith(`${from}/`)) {
    return to + path.slice(from.length)
  }
  return path
}

function fileName(path: string) {
  return modelLabel(path.split(/[\\/]/).pop() || path)
}

function filePath(item: ModelEntry) {
  return item.source || item.path.split('#')[0] || item.path
}

function isFileTile(item: ModelEntry) {
  const ident = item.path.replace(/\\/g, '/')
  const hash = ident.indexOf('#')
  if (hash < 0) {
    return true
  }
  const tag = ident.slice(hash + 1)
  const source = (item.source || ident.slice(0, hash)).replace(/\\/g, '/')
  const cut = source.lastIndexOf('/')
  const folder = cut >= 0 ? source.slice(0, cut + 1) : ''
  const rest = folder && tag.startsWith(folder) ? tag.slice(folder.length) : tag
  return Boolean(rest) && !rest.includes('/')
}

function coversPath(path: string, ident: string) {
  return path === ident || path.startsWith(`${ident}/`) || path.startsWith(`${ident}#`)
}

function tileName(item: ModelEntry) {
  return item.label || item.tag || fileName(item.path)
}

function matchesQuery(item: ModelEntry, query: string, extraNames: string[]) {
  const q = query.trim().toLowerCase()
  if (!q) {
    return true
  }
  const tag = treeDisplayPath(item, extraNames).toLowerCase()
  const path = item.path.replace(/\\/g, '/').toLowerCase()
  const source = identToDisplay(filePath(item), extraNames).toLowerCase()
  if (
    tag === q ||
    tag.startsWith(`${q}/`) ||
    path === q ||
    path.startsWith(`${q}/`) ||
    source === q ||
    source.startsWith(`${q}/`)
  ) {
    return true
  }
  return (
    path.includes(q) ||
    tag.includes(q) ||
    fileName(item.path).toLowerCase().includes(q) ||
    (item.label || '').toLowerCase().includes(q)
  )
}

function sortName(item: ModelEntry) {
  return fileName(filePath(item))
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
    const av = key === 'path' ? a.path : sortName(a)
    const bv = key === 'path' ? b.path : sortName(b)
    const byName = av.localeCompare(bv, undefined, { sensitivity: 'base' })
    if (byName !== 0) {
      return byName
    }
    return a.path.localeCompare(b.path, undefined, { sensitivity: 'base' })
  })
  if (dir === 'desc') {
    next.reverse()
  }
  return next
}

export function GalleryView({ kind, items, value, selected, onSelect }: GalleryViewProps) {
  const navigate = useNavigate()
  const saved = chrome.get(kind)
  const sortKind: GalleryViewKind = kind === 'loras' || kind === 'wildcards' ? kind : 'checkpoints'
  const gallerySortKey = useSettingsStore((s) => s.gallerySortKey[sortKind])
  const gallerySortDir = useSettingsStore((s) => s.gallerySortDir[sortKind])
  const tileScale = useSettingsStore((s) => s.galleryTileScale)
  const parentOnUnselect = useSettingsStore((s) => s.galleryParentOnUnselect)
  const modelDirs = useSettingsStore((s) => s.modelDirs)
  const wildcardDirs = useSettingsStore((s) => s.wildcardDirs)
  const extraNames = useMemo(() => {
    const rows = kind === 'wildcards' ? wildcardDirs : modelDirs
    const names: string[] = []
    const seen = new Set<string>()
    for (const item of rows) {
      const name = item.name.trim()
      const key = name.toLowerCase()
      if (!name || item.id === LOCAL_ID || key === 'local' || key === 'output' || seen.has(key)) {
        continue
      }
      seen.add(key)
      names.push(name)
    }
    return names
  }, [kind, modelDirs, wildcardDirs])
  const rowRef = useRef<HTMLDivElement>(null)
  const treeRef = useRef<HTMLDivElement>(null)
  const tilesRef = useRef<HTMLDivElement>(null)
  const [treeWidth, setTreeWidth] = useState(() => saved?.treeWidth ?? TREE_REM * 16)
  const [openDirs, setOpenDirs] = useState<Set<string>>(
    () => new Set(saved?.openDirs?.length ? saved.openDirs : [LOCAL_DIR]),
  )
  const [showTree, setShowTree] = useState(() => saved?.showTree ?? true)
  const [pinSelected, setPinSelected] = useState(() => saved?.pinSelected ?? true)
  const [query, setQuery] = useState(() => saved?.query ?? '')
  const [sortKey, setSortKey] = useState<SortKey | null>(saved?.sortKey ?? null)
  const [sortDir, setSortDir] = useState<SortDir | null>(saved?.sortDir ?? null)
  const [infoItem, setInfoItem] = useState<ModelEntry | null>(null)
  const [fillConfirm, setFillConfirm] = useState<{ path: string; hit: CivitaiVersion } | null>(null)
  const [filling, setFilling] = useState<string | null>(null)
  const [fsRoots, setFsRoots] = useState<ReturnType<typeof toDisplayRoots>>([])
  const [dragIdent, setDragIdent] = useState<string | null>(null)
  const [fileBusy, setFileBusy] = useState(false)
  const [creating, setCreating] = useState<{ folder: string; name: string } | null>(null)
  const [renaming, setRenaming] = useState<{ path: string; name: string } | null>(null)
  const [pendingMove, setPendingMove] = useState<{ path: string; folder: string; from: string; to: string } | null>(null)
  const [tileMenu, setTileMenu] = useState<{ x: number; y: number; path: string; name: string; fileTile: boolean } | null>(null)
  const [pendingRemove, setPendingRemove] = useState<string | null>(null)
  const thumbView = useThumbView(sortKind)
  const shownSortKey = sortKey ?? gallerySortKey
  const shownSortDir = sortDir ?? gallerySortDir
  const tileW = TILE_COL_REM * tileScale
  const tileH = TILE_ROW_REM * tileScale
  const fileOps = true
  const snap = useRef({
    query,
    sortKey: sortKey ?? undefined,
    sortDir: sortDir ?? undefined,
    showTree,
    pinSelected,
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
    pinSelected,
    treeWidth,
    openDirs,
  }
  const busy = useModelsStore((s) => s.busy)
  const refreshKind = useModelsStore((s) => s.refreshKind)
  const pull = useModelsStore((s) => s.pull)
  const setThumb = useModelsStore((s) => s.setThumb)
  const setMeta = useModelsStore((s) => s.setMeta)
  const paths = useMemo(() => items.map((item) => treeDisplayPath(item, extraNames)).filter(Boolean), [extraNames, items])
  const byTree = useMemo(
    () => new Map(items.map((item) => [treeDisplayPath(item, extraNames), item])),
    [extraNames, items],
  )
  const loadTree = useCallback(async () => {
    try {
      const roots = kind === 'wildcards' ? await getWildcardTree() : await getModelTree(kind)
      setFsRoots(toDisplayRoots(roots, extraNames))
    } catch {
      /* keep current */
    }
  }, [extraNames, kind])
  const tree = useMemo(
    () => (fileOps && fsRoots.length ? fsRoots : buildGalleryTree(paths)),
    [fileOps, fsRoots, paths],
  )
  const treeDirs = useMemo(() => collectDirPaths(tree), [tree])
  const layoutToken = [
    query,
    shownSortKey,
    shownSortDir,
    pinSelected ? '1' : '0',
    extraNames.join('\n'),
    items.map((item) => item.path).join('\n'),
  ].join('\0')
  const pinRef = useRef({ token: layoutToken, selected, value })
  if (pinRef.current.token !== layoutToken) {
    pinRef.current = { token: layoutToken, selected, value }
  }
  const pinnedSelected = pinRef.current.selected
  const pinnedValue = pinRef.current.value
  const tiles = useMemo(() => {
    const isPinned = (item: ModelEntry) =>
      pinnedSelected ? pinnedSelected.includes(item.path) : Boolean(pinnedValue) && pinnedValue === item.path
    if (!pinSelected) {
      return sortItems(
        items.filter((item) => modelPath(item) && matchesQuery(item, query, extraNames)),
        shownSortKey,
        shownSortDir,
      )
    }
    const pinned: ModelEntry[] = []
    const rest: ModelEntry[] = []
    for (const item of items) {
      if (!modelPath(item)) {
        continue
      }
      if (isPinned(item)) {
        pinned.push(item)
      } else if (matchesQuery(item, query, extraNames)) {
        rest.push(item)
      }
    }
    const orderedPinned = pinnedSelected?.length
      ? pinnedSelected.flatMap((path) => pinned.filter((item) => item.path === path))
      : sortItems(pinned, shownSortKey, shownSortDir)
    return [...orderedPinned, ...sortItems(rest, shownSortKey, shownSortDir)]
  }, [extraNames, items, pinnedSelected, pinnedValue, pinSelected, query, shownSortDir, shownSortKey])

  function isOn(path: string) {
    if (selected) {
      return selected.includes(path)
    }
    return Boolean(onSelect) && value === path
  }

  function folderExists(path: string) {
    return treeDirs.has(path) || dirExists(paths, path)
  }

  function applyRelocate(fromIdent: string, toIdent: string, entryKind: 'dir' | 'file') {
    const fromDisplay = identToDisplay(fromIdent, extraNames)
    const toDisplay = identToDisplay(toIdent, extraNames)
    if (onSelect && value) {
      const next = remapPrefix(value, fromIdent, toIdent)
      if (next !== value) {
        onSelect(next)
      }
    }
    setQuery((current) => remapPrefix(current, fromDisplay, toDisplay))
    setOpenDirs((current) => {
      const next = new Set<string>()
      for (const path of current) {
        next.add(remapPrefix(path, fromDisplay, toDisplay))
      }
      const parent = identToDisplay(parentIdent(toIdent), extraNames)
      if (parent) {
        next.add(parent)
      }
      if (entryKind === 'dir') {
        next.add(toDisplay)
      }
      return next
    })
  }

  async function runMove(path: string, folder: string) {
    setFileBusy(true)
    try {
      const next =
        kind === 'wildcards' ? await moveWildcardEntry(path, folder) : await moveModelEntry(kind, path, folder)
      applyRelocate(path, next.path, next.kind)
      await pull()
      await loadTree()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not move', 'error')
    } finally {
      setFileBusy(false)
      setPendingMove(null)
    }
  }

  function requestMove(path: string, folder: string) {
    const from = scopeRoot(path, extraNames)
    const to = scopeRoot(folder, extraNames)
    if (from !== to) {
      setPendingMove({ path, folder, from, to })
      return
    }
    void runMove(path, folder)
  }

  async function saveCivitai(path: string, hit: CivitaiVersion) {
    const info = await waitModelInfo(kind, path, undefined, civitaiSaveThumbView())
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
      const info = await waitModelInfo(kind, path, undefined, civitaiSaveThumbView())
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
    void loadTree()
  }, [loadTree])

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
        pinSelected: now.pinSelected,
        treeWidth: now.treeWidth,
        openDirs: [...now.openDirs],
        treeScroll: treeRef.current?.scrollTop ?? now.treeScroll,
        tileScroll: tilesRef.current?.scrollTop ?? now.tileScroll,
      })
    }
  }, [kind])

  useEffect(() => {
    if (treeDirs.size === 0 && paths.length === 0) {
      return
    }
    setOpenDirs((current) => {
      const next = new Set<string>()
      for (const path of current) {
        if (folderExists(path)) {
          next.add(path)
        }
      }
      if (next.size === 0 && folderExists(LOCAL_DIR)) {
        next.add(LOCAL_DIR)
      }
      if (next.size === current.size && [...next].every((path) => current.has(path))) {
        return current
      }
      return next
    })
  }, [paths, treeDirs])

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
      if (parentOnUnselect) {
        const cut = path.lastIndexOf('/')
        const parent = cut > 0 ? path.slice(0, cut) : ''
        setQuery(parent && folderExists(parent) ? parent : '')
      } else {
        setQuery('')
      }
      return
    }
    setQuery(path)
  }

  function clickFile(path: string) {
    const same = query.trim() === path
    if (same) {
      const cut = path.lastIndexOf('/')
      const parent = cut > 0 ? path.slice(0, cut) : ''
      if (parentOnUnselect) {
        setQuery(parent && folderExists(parent) ? parent : '')
      } else {
        setQuery('')
      }
      return
    }
    setQuery(path)
  }

  async function createFolder() {
    if (!creating || fileBusy) {
      return
    }
    const name = creating.name.trim()
    if (!name) {
      return
    }
    setFileBusy(true)
    try {
      const next =
        kind === 'wildcards'
          ? await createWildcardFolder(creating.folder, name)
          : await createModelFolder(kind, creating.folder, name)
      const display = identToDisplay(next.path, extraNames)
      setOpenDirs((current) => new Set(current).add(identToDisplay(creating.folder, extraNames)).add(display))
      setQuery(display)
      setCreating(null)
      await loadTree()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not create folder', 'error')
    } finally {
      setFileBusy(false)
    }
  }

  async function renameEntry() {
    if (!renaming || fileBusy) {
      return
    }
    const name = renaming.name.trim()
    if (!name) {
      return
    }
    setFileBusy(true)
    try {
      const next =
        kind === 'wildcards'
          ? await renameWildcardEntry(renaming.path, name)
          : await renameModelEntry(kind, renaming.path, name)
      applyRelocate(renaming.path, next.path, next.kind)
      setRenaming(null)
      await pull()
      await loadTree()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not rename', 'error')
    } finally {
      setFileBusy(false)
    }
  }

  function openInManager(ident: string, dir: boolean) {
    navigate('/wildcards', { state: { open: ident, dir } })
  }

  async function revealEntry(path: string) {
    try {
      if (kind === 'wildcards') {
        await revealWildcardFile(path)
      } else {
        await revealModelFile(kind, path)
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not open folder', 'error')
    }
  }

  function applyRemove(ident: string) {
    if (onSelect && value && coversPath(value, ident)) {
      onSelect('')
    }
    const display = identToDisplay(ident, extraNames)
    setQuery((current) => {
      if (current === display || current.startsWith(`${display}/`)) {
        const parent = identToDisplay(parentIdent(ident), extraNames)
        return parent
      }
      return current
    })
  }

  async function runRemove(ident: string) {
    setFileBusy(true)
    try {
      await trashEntry(kind, ident)
      applyRemove(ident)
      setPendingRemove(null)
      await pull()
      await loadTree()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not remove', 'error')
    } finally {
      setFileBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-8 shrink-0 items-stretch gap-1">
        <ThumbnailScopePicker fallbackKind={sortKind} />
      </div>
      <div className="flex h-8 shrink-0 items-stretch gap-1">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-muted">
            <AppIcon id="search" size={12} />
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
          <AppIcon id={shownSortDir === 'asc' ? 'arrow-up-narrow-wide' : 'arrow-down-narrow-wide'} />
        </button>
        <button
          type="button"
          className={['icon-btn', showTree ? 'bg-line' : ''].join(' ')}
          aria-label={showTree ? 'Hide tree' : 'Show tree'}
          aria-pressed={showTree}
          title={showTree ? 'Hide tree' : 'Show tree'}
          onClick={() => setShowTree((on) => !on)}
        >
          <AppIcon id="folder-tree" />
        </button>
        <button
          type="button"
          className={['icon-btn', pinSelected ? 'bg-line' : ''].join(' ')}
          aria-label={pinSelected ? 'Unpin selected from top' : 'Pin selected to top'}
          aria-pressed={pinSelected}
          title={pinSelected ? 'Unpin selected from top' : 'Pin selected to top'}
          onClick={() => setPinSelected((on) => !on)}
        >
          {pinSelected ? <AppIcon id="eye" /> : <AppIcon id="eye-off" />}
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Refresh models"
          title="Refresh models (R)"
          disabled={busy}
          onClick={() => void refreshKind(kind).then(() => loadTree())}
        >
          <AppIcon id="refresh-cw" />
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
              <GalleryTree
                roots={tree}
                query={query}
                openDirs={openDirs}
                extraNames={extraNames}
                fileOps={fileOps}
                externalDrag={dragIdent}
                fileOn={(path) => {
                  if (query.trim() === path) {
                    return true
                  }
                  const ident = displayToIdent(path)
                  return items.some((item) => isOn(item.path) && filePath(item) === ident)
                }}
                fileLabel={(path, name) => {
                  const item = byTree.get(path)
                  return item ? tileName(item) : name
                }}
                onClickDir={clickDir}
                onClickFile={clickFile}
                onMove={requestMove}
                onRename={(path, name) => setRenaming({ path: displayToIdent(path), name })}
                onReveal={(path) => void revealEntry(displayToIdent(path))}
                onRemove={(path) => setPendingRemove(displayToIdent(path))}
                onAdd={(folder) => setCreating({ folder: displayToIdent(folder), name: '' })}
                onOpenManager={
                  kind === 'wildcards'
                    ? (path, nodeKind) => openInManager(displayToIdent(path), nodeKind === 'dir')
                    : undefined
                }
              />
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
                const strength = kind === 'loras' ? storedLoraStrengthLabel(item.strength, item.slider) : ''
                const preview = (
                  <TilePreview
                    className="w-full"
                    src={modelThumbSrc(kind, item, thumbView)}
                    mark="?"
                    label={tileName(item)}
                    badge={strength || undefined}
                  />
                )
                return (
                  <div
                    key={item.path}
                    className="min-w-0 p-1.5 [content-visibility:auto]"
                    style={{ containIntrinsicSize: `${tileW}rem ${tileH}rem` }}
                  >
                    <div className="group relative">
                      {onSelect ? (
                        <button
                          type="button"
                          title={item.path}
                          draggable={fileOps}
                          className={['w-full rounded', selected ? 'ring-2 ring-ink ring-offset-2 ring-offset-panel' : ''].join(' ')}
                          onClick={() => onSelect(item.path)}
                          onContextMenu={(event) => {
                            if (!fileOps) {
                              return
                            }
                            event.preventDefault()
                            setTileMenu({
                              x: event.clientX,
                              y: event.clientY,
                              path: filePath(item),
                              name: fileName(filePath(item)),
                              fileTile: isFileTile(item),
                            })
                          }}
                          onDragStart={(event) => {
                            if (!fileOps) {
                              event.preventDefault()
                              return
                            }
                            event.dataTransfer.effectAllowed = 'move'
                            event.dataTransfer.setData('text/plain', filePath(item))
                            setDragIdent(filePath(item))
                          }}
                          onDragEnd={() => setDragIdent(null)}
                        >
                          {preview}
                        </button>
                      ) : (
                        <div
                          title={item.path}
                          draggable={fileOps}
                          className="w-full rounded"
                          onContextMenu={(event) => {
                            if (!fileOps) {
                              return
                            }
                            event.preventDefault()
                            setTileMenu({
                              x: event.clientX,
                              y: event.clientY,
                              path: filePath(item),
                              name: fileName(filePath(item)),
                              fileTile: isFileTile(item),
                            })
                          }}
                          onDragStart={(event) => {
                            if (!fileOps) {
                              event.preventDefault()
                              return
                            }
                            event.dataTransfer.effectAllowed = 'move'
                            event.dataTransfer.setData('text/plain', filePath(item))
                            setDragIdent(filePath(item))
                          }}
                          onDragEnd={() => setDragIdent(null)}
                        >
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
                          <AppIcon id="download" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Model settings"
                        title="Model settings"
                        onClick={() => setInfoItem(item)}
                      >
                        <AppIcon id="info" />
                      </button>
                    </div>
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
      {creating ? (
        <GalleryCreateFolderDialog
          folder={identToDisplay(creating.folder, extraNames)}
          name={creating.name}
          taken={siblingNames(tree, identToDisplay(creating.folder, extraNames)) ?? []}
          busy={fileBusy}
          onName={(name) => setCreating({ ...creating, name })}
          onClose={() => setCreating(null)}
          onCreate={() => void createFolder()}
        />
      ) : null}
      {renaming ? (
        <GalleryRenameDialog
          name={renaming.name}
          taken={siblingNames(tree, identToDisplay(parentIdent(renaming.path), extraNames)) ?? []}
          busy={fileBusy}
          onName={(name) => setRenaming({ ...renaming, name })}
          onClose={() => setRenaming(null)}
          onRename={() => void renameEntry()}
        />
      ) : null}
      {pendingMove ? (
        <ConfirmDialog
          title="Move to another directory?"
          body={`This moves the item from ${pendingMove.from} to ${pendingMove.to}.`}
          onClose={() => setPendingMove(null)}
          actions={[
            { label: 'Cancel', onClick: () => setPendingMove(null) },
            {
              label: 'Move',
              kind: 'primary',
              onClick: () => void runMove(pendingMove.path, pendingMove.folder),
            },
          ]}
        />
      ) : null}
      {pendingRemove ? (
        <ConfirmDialog
          title="Move to Trash?"
          body="This can be restored from Settings → Trash."
          onClose={() => setPendingRemove(null)}
          actions={[
            { label: 'Cancel', onClick: () => setPendingRemove(null) },
            {
              label: 'Remove',
              kind: 'primary',
              danger: true,
              onClick: () => void runRemove(pendingRemove),
            },
          ]}
        />
      ) : null}
      {tileMenu ? (
        <ContextMenu x={tileMenu.x} y={tileMenu.y} onClose={() => setTileMenu(null)}>
          {tileMenu.fileTile ? (
            <ContextMenuItem
              label="Rename"
              onClick={() => {
                setRenaming({ path: tileMenu.path, name: tileMenu.name })
                setTileMenu(null)
              }}
            />
          ) : null}
          <ContextMenuItem
            label="Show in Explorer"
            onClick={() => {
              void revealEntry(tileMenu.path)
              setTileMenu(null)
            }}
          />
          {kind === 'wildcards' ? (
            <ContextMenuItem
              icon="file-pen"
              label="Open in Wildcard Manager"
              onClick={() => {
                openInManager(tileMenu.path, false)
                setTileMenu(null)
              }}
            />
          ) : null}
          {tileMenu.fileTile ? (
            <ContextMenuItem
              label="Remove"
              danger
              onClick={() => {
                setPendingRemove(tileMenu.path)
                setTileMenu(null)
              }}
            />
          ) : null}
        </ContextMenu>
      ) : null}
    </div>
  )
}
