import { GalleryOverlays } from '@/components/composites/gallery/GalleryOverlays.tsx'
import {
  buildGalleryTree,
  collectDirPaths,
  displayToIdent,
  LOCAL_DIR,
  toDisplayRoots,
  treeDisplayPath,
} from '@/lib/gallery/tree.ts'
import { GalleryTiles } from '@/components/composites/gallery/GalleryTiles.tsx'
import { GalleryToolbar, GALLERY_SORTS, type GallerySortDir, type GallerySortKey } from '@/components/composites/gallery/GalleryToolbar.tsx'
import {
  chrome,
  EMPTY_TYPES,
  fileName,
  filePath,
  isFileTile,
  isOtherKind,
  matchesQuery,
  matchesTypes,
  OTHER_KIND_IDS,
  otherKindLabel,
  remPx,
  sortItems,
  tileName,
  galleryBodyRem,
  TILE_CELL_PAD_REM,
  TILE_COL_REM,
  TILE_GAP_REM,
  TILE_ROW_REM,
  TREE_MIN_REM,
  TREE_REM,
  LOCAL_ID,
} from '@/components/composites/gallery/galleryUtils.ts'
import { filterTypeSections, MODEL_TYPE_SECTIONS } from '@/lib/modelTypes.ts'
import { modelPath, useModelsStore } from '@/stores/modelsStore.ts'
import {
  galleryFilterKey,
  galleryModeKey,
  galleryModeValue,
  galleryScopeKey,
  galleryShareLabel,
  GALLERY_SORT_DIR_DEFAULT,
  GALLERY_SORT_KEY_DEFAULT,
  isGenerateGallery,
  useSettingsStore,
  type GalleryViewKind,
} from '@/stores/settingsStore.ts'
import { useThumbView } from '@/stores/thumbnailScopeStore.ts'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getModelTree, getWildcardTree, type ModelEntry, type ModelLists } from '@/lib/api.ts'
import { useGalleryFileOps } from '@/components/composites/gallery/useGalleryFileOps.ts'
import { useGalleryAutoTypes } from '@/components/composites/gallery/useGalleryAutoTypes.ts'
export { GALLERY_SORTS }
export type { GallerySortDir, GallerySortKey }

type SortKey = GallerySortKey

type GalleryViewProps = {
  kind: keyof ModelLists
  items: ModelEntry[]
  value?: string
  selected?: string[]
  focus?: string
  onSelect?: (id: string) => void
  chromeKey?: string
  fill?: boolean
  fileOps?: boolean
  tileScale?: number
  itemKind?: (item: ModelEntry) => keyof ModelLists
}

export function GalleryBrowser({
  kind,
  items,
  value,
  selected,
  focus,
  onSelect,
  chromeKey,
  fill = false,
  fileOps = true,
  tileScale: tileScaleOverride,
  itemKind,
}: GalleryViewProps) {
  const navigate = useNavigate()
  const viewKey = chromeKey || kind
  const modeKey = galleryModeKey(viewKey)
  const generate = isGenerateGallery(viewKey)
  const filterKey = useSettingsStore((s) => galleryFilterKey(viewKey, s))
  const scopeKey = useSettingsStore((s) => galleryScopeKey(viewKey, s))
  const scopeGlobal = useSettingsStore((s) => galleryModeValue(s.galleryScopeMode, viewKey) === 'global')
  const filterGlobal = useSettingsStore((s) => galleryModeValue(s.galleryFilterMode, viewKey) === 'global')
  const setGalleryScopeMode = useSettingsStore((s) => s.setGalleryScopeMode)
  const setGalleryFilterMode = useSettingsStore((s) => s.setGalleryFilterMode)
  const saved = chrome.get(viewKey)
  const sortKind: GalleryViewKind =
    kind === 'loras' || kind === 'wildcards' ? kind : viewKey === 'other' || viewKey.endsWith('-other') ? 'other' : 'checkpoints'
  const gallerySortKey = useSettingsStore((s) => s.gallerySortKey[filterKey] ?? GALLERY_SORT_KEY_DEFAULT)
  const gallerySortDir = useSettingsStore((s) => s.gallerySortDir[filterKey] ?? GALLERY_SORT_DIR_DEFAULT)
  const setGallerySortKey = useSettingsStore((s) => s.setGallerySortKey)
  const setGallerySortDir = useSettingsStore((s) => s.setGallerySortDir)
  const pinSelected = useSettingsStore((s) => s.galleryPinSelected[modeKey] ?? true)
  const setGalleryPinSelected = useSettingsStore((s) => s.setGalleryPinSelected)
  const galleryTileScale = useSettingsStore((s) => s.galleryTileScale)
  const tileScale = tileScaleOverride ?? galleryTileScale
  const parentOnUnselect = useSettingsStore((s) => s.galleryParentOnUnselect)
  const modelDirs = useSettingsStore((s) => s.modelDirs)
  const wildcardDirs = useSettingsStore((s) => s.wildcardDirs)
  const typeFilter = useSettingsStore((s) => s.galleryTypes[filterKey] ?? EMPTY_TYPES)
  const setGalleryTypes = useSettingsStore((s) => s.setGalleryTypes)
  const autoType = useSettingsStore((s) => generate && s.galleryAutoTypes[filterKey] !== false)
  const setGalleryAutoTypes = useSettingsStore((s) => s.setGalleryAutoTypes)
  const query = useSettingsStore((s) => s.galleryQuery[modeKey] ?? '')
  const setGalleryQuery = useSettingsStore((s) => s.setGalleryQuery)
  const hiddenModelTypes = useSettingsStore((s) => s.hiddenModelTypes)
  const otherGallery = kind === 'vae' && Boolean(itemKind)
  const typeOptions = useMemo(() => {
    const sections = filterTypeSections(MODEL_TYPE_SECTIONS, (item) => !hiddenModelTypes.includes(item))
    if (!otherGallery) {
      return sections
    }
    return [{ title: 'Kind', options: [...OTHER_KIND_IDS] }, ...sections]
  }, [hiddenModelTypes, otherGallery])
  const visibleTypeFilter = useMemo(
    () =>
      typeFilter.filter(
        (item) => (otherGallery || !isOtherKind(item)) && (isOtherKind(item) || !hiddenModelTypes.includes(item)),
      ),
    [hiddenModelTypes, otherGallery, typeFilter],
  )
  useGalleryAutoTypes(generate, filterKey, autoType, setGalleryTypes)
  const extraNames = useMemo(() => {
    const rows = itemKind ? [...modelDirs, ...wildcardDirs] : kind === 'wildcards' ? wildcardDirs : modelDirs
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
  }, [itemKind, kind, modelDirs, wildcardDirs])
  const rowRef = useRef<HTMLDivElement>(null)
  const treeRef = useRef<HTMLDivElement>(null)
  const tilesRef = useRef<HTMLDivElement>(null)
  const [treeWidth, setTreeWidth] = useState(() => saved?.treeWidth ?? TREE_REM * 16)
  const [showTree, setShowTree] = useState(() => saved?.showTree ?? true)
  function setQuery(update: string | ((current: string) => string)) {
    const current = useSettingsStore.getState().galleryQuery[modeKey] ?? ''
    const next = typeof update === 'function' ? update(current) : update
    setGalleryQuery(modeKey, next)
  }
  const [infoItem, setInfoItem] = useState<ModelEntry | null>(null)
  const [fsRoots, setFsRoots] = useState<ReturnType<typeof toDisplayRoots>>([])
  const [dragIdent, setDragIdent] = useState<string | null>(null)
  const [tileMenu, setTileMenu] = useState<{ x: number; y: number; path: string; name: string; fileTile: boolean } | null>(null)
  const thumbView = useThumbView(sortKind, scopeKey)
  const shownSortKey = gallerySortKey
  const shownSortDir = gallerySortDir
  const tileW = TILE_COL_REM * tileScale
  const tileH = TILE_ROW_REM * tileScale
  const tileCellW = tileW + TILE_CELL_PAD_REM
  const tileCellH = tileH + TILE_CELL_PAD_REM
  const bodyRem = galleryBodyRem(tileH)
  const busy = useModelsStore((s) => s.busy)
  const refreshKind = useModelsStore((s) => s.refreshKind)
  const refreshAll = useModelsStore((s) => s.refresh)
  const pull = useModelsStore((s) => s.pull)
  const setThumb = useModelsStore((s) => s.setThumb)
  const setMeta = useModelsStore((s) => s.setMeta)
  function kindOf(item: ModelEntry) {
    return itemKind ? itemKind(item) : kind
  }
  const paths = useMemo(() => items.map((item) => treeDisplayPath(item, extraNames)).filter(Boolean), [extraNames, items])
  const byTree = useMemo(
    () => new Map(items.map((item) => [treeDisplayPath(item, extraNames), item])),
    [extraNames, items],
  )
  const loadTree = useCallback(async () => {
    if (itemKind) {
      setFsRoots([])
      return
    }
    try {
      const roots = kind === 'wildcards' ? await getWildcardTree() : await getModelTree(kind)
      setFsRoots(toDisplayRoots(roots, extraNames))
    } catch {
      /* keep current */
    }
  }, [extraNames, itemKind, kind])
  const tree = useMemo(
    () => (fileOps && fsRoots.length ? fsRoots : buildGalleryTree(paths)),
    [fileOps, fsRoots, paths],
  )
  const treeDirs = useMemo(() => collectDirPaths(tree), [tree])
  const fileActions = useGalleryFileOps({
    kind,
    extraNames,
    paths,
    treeDirs,
    savedOpenDirs: saved?.openDirs,
    query,
    setQuery,
    parentOnUnselect,
    onSelect,
    value,
    pull,
    loadTree,
    setThumb,
    setMeta,
  })
  const {
    openDirs,
    setOpenDirs,
    fillConfirm,
    setFillConfirm,
    filling,
    fileBusy,
    creating,
    setCreating,
    renaming,
    setRenaming,
    pendingMove,
    setPendingMove,
    pendingRemove,
    setPendingRemove,
    folderExists,
    requestMove,
    runMove,
    downloadCivitai,
    clickDir,
    clickFile,
    createFolder,
    renameEntry,
    revealEntry,
    runRemove,
  } = fileActions
  const snap = useRef({
    query,
    showTree,
    treeWidth,
    openDirs,
    treeScroll: saved?.treeScroll ?? 0,
    tileScroll: saved?.tileScroll ?? 0,
  })
  snap.current = {
    ...snap.current,
    query,
    showTree,
    treeWidth,
    openDirs,
  }
  const layoutToken = [
    query,
    shownSortKey,
    shownSortDir,
    pinSelected ? '1' : '0',
    extraNames.join('\n'),
    visibleTypeFilter.join('\n'),
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
    function keep(item: ModelEntry, pinned: boolean) {
      return (
        Boolean(modelPath(item)) &&
        (pinned || matchesQuery(item, query, extraNames)) &&
        matchesTypes(item, visibleTypeFilter, itemKind?.(item) ?? kind)
      )
    }
    if (!pinSelected) {
      return sortItems(
        items.filter((item) => keep(item, false)),
        shownSortKey,
        shownSortDir,
      )
    }
    const pinned: ModelEntry[] = []
    const rest: ModelEntry[] = []
    for (const item of items) {
      if (isPinned(item)) {
        if (keep(item, true)) {
          pinned.push(item)
        }
      } else if (keep(item, false)) {
        rest.push(item)
      }
    }
    const orderedPinned = pinnedSelected?.length
      ? pinnedSelected.flatMap((path) => pinned.filter((item) => item.path === path))
      : sortItems(pinned, shownSortKey, shownSortDir)
    return [...orderedPinned, ...sortItems(rest, shownSortKey, shownSortDir)]
  }, [extraNames, itemKind, items, kind, pinnedSelected, pinnedValue, pinSelected, query, shownSortDir, shownSortKey, visibleTypeFilter])

  function isOn(path: string) {
    if (selected) {
      return selected.includes(path)
    }
    return Boolean(onSelect) && value === path
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
      chrome.set(viewKey, {
        query: now.query,
        showTree: now.showTree,
        treeWidth: now.treeWidth,
        openDirs: [...now.openDirs],
        treeScroll: treeRef.current?.scrollTop ?? now.treeScroll,
        tileScroll: tilesRef.current?.scrollTop ?? now.tileScroll,
      })
    }
  }, [viewKey])

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

  function openInManager(ident: string, dir: boolean) {
    navigate('/wildcards', { state: { open: ident, dir } })
  }

  return (
    <div className={fill ? 'flex h-full min-h-0 flex-col gap-2' : 'flex flex-col gap-2'}>
      <GalleryToolbar
        sortKind={sortKind}
        scopeKey={scopeKey}
        query={query}
        onQuery={setQuery}
        typeOptions={typeOptions}
        typeFilter={visibleTypeFilter}
        onTypes={(value) => {
          if (autoType) {
            setGalleryAutoTypes(filterKey, false)
          }
          const kinds = otherGallery
            ? []
            : (useSettingsStore.getState().galleryTypes[filterKey] ?? EMPTY_TYPES).filter(isOtherKind)
          setGalleryTypes(filterKey, otherGallery ? value : [...kinds, ...value.filter((item) => !isOtherKind(item))])
        }}
        chipLabel={(item) => otherKindLabel(item) || item}
        sortKey={shownSortKey}
        sortDir={shownSortDir}
        onSortKey={(value) => setGallerySortKey(filterKey, value as SortKey)}
        onSortDir={() => setGallerySortDir(filterKey, shownSortDir === 'asc' ? 'desc' : 'asc')}
        showTree={showTree}
        onShowTree={() => setShowTree((on) => !on)}
        pinSelected={pinSelected}
        onPinSelected={() => setGalleryPinSelected(modeKey, !pinSelected)}
        hasSelection={Boolean(onSelect)}
        busy={busy}
        onRefresh={() => void (itemKind ? refreshAll() : refreshKind(kind)).then(() => loadTree())}
        scopeGlobal={scopeGlobal}
        onScopeGlobal={() => setGalleryScopeMode(modeKey, scopeGlobal ? 'local' : 'global')}
        filterGlobal={filterGlobal}
        onFilterGlobal={() => setGalleryFilterMode(modeKey, filterGlobal ? 'local' : 'global')}
        shareLabel={galleryShareLabel(viewKey)}
        autoType={autoType}
        onAutoType={generate ? () => setGalleryAutoTypes(filterKey, !autoType) : undefined}
      />
      <GalleryTiles
        rowRef={rowRef}
        treeRef={treeRef}
        tilesRef={tilesRef}
        fill={fill}
        bodyRem={bodyRem}
        showTree={showTree}
        treeWidth={treeWidth}
        minTreeWidth={TREE_MIN_REM * remPx()}
        onTreeWidth={setTreeWidth}
        onResetTreeWidth={() => setTreeWidth(TREE_REM * remPx())}
        tree={tree}
        query={query}
        openDirs={openDirs}
        extraNames={extraNames}
        fileOps={fileOps}
        dragIdent={dragIdent}
        onDragIdent={setDragIdent}
        onTreeScroll={(value) => {
          snap.current.treeScroll = value
        }}
        onTileScroll={(value) => {
          snap.current.tileScroll = value
        }}
        byTree={byTree}
        items={items}
        isOn={isOn}
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
        tiles={tiles}
        tileCellW={tileCellW}
        tileCellH={tileCellH}
        tileGapRem={TILE_GAP_REM}
        kindOf={kindOf}
        pathOf={filePath}
        labelOf={tileName}
        thumbView={thumbView}
        focus={focus}
        onSelect={onSelect}
        onTileMenu={(event, item) => {
          if (!fileOps) {
            return
          }
          event.preventDefault()
          const path = filePath(item)
          setTileMenu({ x: event.clientX, y: event.clientY, path, name: fileName(path), fileTile: isFileTile(item) })
        }}
        filling={filling}
        onDownload={(path, itemKind) => void downloadCivitai(path, itemKind)}
        onInfo={setInfoItem}
      />
      <GalleryOverlays
        kind={kind}
        scopeKey={scopeKey}
        extraNames={extraNames}
        tree={tree}
        kindOf={kindOf}
        infoItem={infoItem}
        onInfoClose={() => setInfoItem(null)}
        onInfoSaved={(thumb) => {
          if (infoItem) {
            setThumb(kindOf(infoItem), infoItem.path, thumb)
            setInfoItem({ ...infoItem, thumb })
          }
        }}
        fillConfirm={fillConfirm}
        onFillClose={() => setFillConfirm(null)}
        onFill={() => void fileActions.replaceCivitai()}
        creating={creating}
        renaming={renaming}
        fileBusy={fileBusy}
        onCreateName={(name) => setCreating({ ...creating!, name })}
        onCreateClose={() => setCreating(null)}
        onCreate={() => void createFolder()}
        onRenameName={(name) => setRenaming({ ...renaming!, name })}
        onRenameClose={() => setRenaming(null)}
        onRename={() => void renameEntry()}
        pendingMove={pendingMove}
        onMoveClose={() => setPendingMove(null)}
        onMove={() => void runMove(pendingMove!.path, pendingMove!.folder)}
        pendingRemove={pendingRemove}
        onRemoveClose={() => setPendingRemove(null)}
        onRemove={() => void runRemove(pendingRemove!)}
        tileMenu={tileMenu}
        onTileClose={() => setTileMenu(null)}
        onTileRename={(path, name) => {
          setRenaming({ path, name })
          setTileMenu(null)
        }}
        onTileReveal={(path) => {
          void revealEntry(path)
          setTileMenu(null)
        }}
        onTileOpenManager={(path) => {
          openInManager(path, false)
          setTileMenu(null)
        }}
        onTileRemove={(path) => {
          setPendingRemove(path)
          setTileMenu(null)
        }}
      />
    </div>
  )
}
