import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { ButtonControl } from '@/components/controls/button/ButtonControl.tsx'
import { SegmentSwitch } from '@/components/controls/button/SegmentSwitch.tsx'
import { PaneSplitter } from '@/components/controls/resizable-panel/PaneSplitter.tsx'
import { ChipSelect } from '@/components/controls/chip-select/ChipSelect.tsx'
import { IconButton } from '@/components/controls/button/IconButton.tsx'
import { TextField } from '@/components/controls/input/TextField.tsx'
import { ConfirmDialog } from '@/components/controls/dialog/Dialog.tsx'
import { NameDialog } from '@/components/controls/dialog/NameDialog.tsx'
import { LightboxView } from '@/components/composites/models/LightboxView.tsx'
import {
  browseGallery,
  createGalleryLibrary,
  deleteGalleryLibrary,
  galleryItemImageUrl,
  getGalleryHome,
  getThumbScopes,
  listGalleryLibraries,
  orderGalleryLibraries,
  removeGalleryItem,
  searchGallery,
  setGalleryFavorite,
  updateGalleryLibrary,
  type GalleryBrowseItem,
  type GalleryHome as GalleryHomeData,
  type GalleryItem,
  type GalleryLibrary,
  type ThumbScope,
} from '@/lib/api.ts'
import { galleryBrowseKey, useSettingsStore, type GalleryBrowseKind } from '@/stores/settingsStore.ts'
import { toast } from '@/stores/toastStore.ts'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { GalleryBrowse } from '@/views/gallery/panels/content/sections/browse/GalleryBrowse.tsx'
import { GalleryFilterTiles } from '@/views/gallery/panels/content/GalleryFilterTiles.tsx'
import { GalleryImageToolbar } from '@/views/gallery/panels/content/GalleryImageToolbar.tsx'
import { GallerySearchFilters } from '@/views/gallery/panels/content/GallerySearchFilters.tsx'
import { GalleryEditDialog } from '@/views/gallery/panels/content/sections/libraries/GalleryEditDialog.tsx'
import { GalleryHome } from '@/views/gallery/panels/content/sections/home/GalleryHome.tsx'
import { GalleryLibraries } from '@/views/gallery/panels/content/sections/libraries/GalleryLibraries.tsx'
import { GallerySidebar } from '@/views/gallery/panels/sidebar/GallerySidebar.tsx'
import { GalleryResults } from '@/views/gallery/panels/content/sections/results/GalleryResults.tsx'
import { EMPTY_FILTERS, filtersActive, newestStamp, type GalleryFilters, type GalleryMedia, type GallerySidebarId } from '@/views/gallery/panels/content/filters.ts'
import { ancestorsOf, descendantIds, isFolder } from '@/views/gallery/panels/content/libraryTree.ts'
import { useGalleryLive } from '@/views/gallery/panels/content/useGalleryLive.ts'

const NAV_REM = 14
const NAV_MIN_REM = 10
const EMPTY_HOME: GalleryHomeData = { recent: [], tags: [], checkpoints: [], loras: [], wildcards: [] }
const EMPTY_COPY = 'Nothing yet. Generate something on the Generate tab.'
const MEDIA: { id: GalleryMedia; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Videos' },
]

function remPx() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

function isBrowse(nav: GallerySidebarId): nav is GalleryBrowseKind {
  return nav === 'checkpoints' || nav === 'loras' || nav === 'wildcards' || nav === 'tags'
}

function searchArgs(filters: GalleryFilters, pageSize: number, cursor?: string, folder?: string) {
  return {
    q: filters.q,
    tags: filters.tags,
    scopes: filters.scopes,
    models: filters.models,
    loras: filters.loras,
    wildcards: filters.wildcards,
    media: filters.media,
    orientation: filters.orientation,
    folder: folder || undefined,
    limit: pageSize,
    random: filters.random || undefined,
    favorite: filters.favorite || undefined,
    ...(cursor ? { cursor } : {}),
  }
}

function mergeFront(incoming: GalleryItem[], prev: GalleryItem[]) {
  const seen = new Set(incoming.map((item) => item.id))
  return [...incoming, ...prev.filter((item) => !seen.has(item.id))]
}

export function GalleryView() {
  const visible = useLocation().pathname === '/gallery'
  const navigate = useNavigate()
  const rowRef = useRef<HTMLDivElement>(null)
  const [navWidth, setNavWidth] = useState(NAV_REM * 16)
  const [nav, setNav] = useState<GallerySidebarId>('home')
  const [filters, setFilters] = useState<GalleryFilters>(EMPTY_FILTERS)
  const [shuffle, setShuffle] = useState(0)
  const [home, setHome] = useState<GalleryHomeData>(EMPTY_HOME)
  const [homeReady, setHomeReady] = useState(false)
  const [results, setResults] = useState<GalleryItem[]>([])
  const [cursor, setCursor] = useState('')
  const [browse, setBrowse] = useState<GalleryBrowseItem[]>([])
  const [libraries, setLibraries] = useState<GalleryLibrary[]>([])
  const [scopes, setScopes] = useState<ThumbScope[]>([])
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ items: GalleryItem[]; index: number } | null>(null)
  const [edit, setEdit] = useState<GalleryLibrary | 'new' | null>(null)
  const [createParent, setCreateParent] = useState<string | null>(null)
  const [folderName, setFolderName] = useState<{ parentId: string | null; name: string } | null>(null)
  const [renameFolder, setRenameFolder] = useState<GalleryLibrary | null>(null)
  const [folderView, setFolderView] = useState<'galleries' | 'images'>('galleries')
  const [remove, setRemove] = useState<GalleryLibrary | null>(null)
  const [trashImage, setTrashImage] = useState<GalleryItem | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const loadingMoreRef = useRef(false)
  const folderId = nav.startsWith('folder:') ? nav.slice(7) : ''
  const folderImages = Boolean(folderId) && folderView === 'images'
  const searching = filtersActive(filters) || nav.startsWith('library:') || folderImages || nav === 'recent'
  const share = useSettingsStore((s) => s.galleryBrowseShare)
  const browseKey = isBrowse(nav) ? galleryBrowseKey(nav, share) : ''
  const sort = useSettingsStore((s) =>
    browseKey ? s.galleryBrowseSort[browseKey] ?? (nav === 'tags' && !share ? 'works' : 'recent') : 'recent',
  )
  const dir = useSettingsStore((s) => (browseKey ? s.galleryBrowseDir[browseKey] ?? 'desc' : 'desc'))
  const pageSize = useSettingsStore((s) => s.galleryPageSize)
  const navRef = useRef(nav)
  const filtersRef = useRef(filters)
  const searchingRef = useRef(searching)
  const pageSizeRef = useRef(pageSize)
  const homeRef = useRef(home)
  const folderViewRef = useRef(folderView)
  navRef.current = nav
  filtersRef.current = filters
  searchingRef.current = searching
  pageSizeRef.current = pageSize
  homeRef.current = home
  folderViewRef.current = folderView

  const onLive = useCallback(() => {
    const currentNav = navRef.current
    const currentFilters = filtersRef.current
    if (searchingRef.current) {
      if (currentFilters.random) {
        return
      }
      void searchGallery(
        searchArgs(
          currentFilters,
          pageSizeRef.current,
          undefined,
          currentNav.startsWith('folder:') && folderViewRef.current === 'images' ? currentNav.slice(7) : '',
        ),
      )
        .then((data) => {
          if (!searchingRef.current || filtersRef.current !== currentFilters) {
            return
          }
          setResults((prev) => mergeFront(data.items, prev))
          setError(null)
        })
        .catch(() => undefined)
      return
    }
    if (currentNav === 'home' || homeRef.current.recent.length === 0) {
      void getGalleryHome()
        .then((data) => {
          setHome((prev) => {
            const shelves = prev.checkpoints.length || prev.loras.length || prev.wildcards.length || prev.tags.length
            return shelves ? { ...prev, recent: data.recent } : data
          })
          setHomeReady(true)
          if (navRef.current === 'home') {
            setError(null)
          }
        })
        .catch(() => undefined)
    }
  }, [])
  const setNewest = useGalleryLive(visible, onLive)

  useEffect(() => {
    if (!visible) {
      return
    }
    void Promise.all([
      listGalleryLibraries(),
      getThumbScopes(),
    ])
      .then(([nextLibraries, nextScopes]) => {
        setLibraries(nextLibraries)
        setScopes(nextScopes.filter((item) => item.id !== 'global'))
      })
      .catch(() => undefined)
  }, [visible])

  useEffect(() => {
    if (!visible) {
      return
    }
    let stop = false
    const loadHome = nav === 'home' || !homeReady
    if (loadHome) {
      void getGalleryHome()
        .then((data) => {
          if (stop) {
            return
          }
          setHome(data)
          setHomeReady(true)
          if (!searching && nav === 'home') {
            setError(null)
            setNewest(newestStamp(data.recent))
          }
        })
        .catch((err: unknown) => {
          if (!stop) {
            setHomeReady(true)
            if (nav === 'home' && !searching) {
              setError(err instanceof Error ? err.message : 'Could not load gallery')
            }
          }
        })
    }
    if (searching) {
      loadingMoreRef.current = false
      setLoadingMore(false)
      void searchGallery(searchArgs(filters, pageSize, undefined, folderImages ? folderId : ''))
        .then((data) => {
          if (stop) {
            return
          }
          setResults(data.items)
          setCursor(data.cursor)
          setError(null)
          setNewest(newestStamp(data.items))
        })
        .catch((err: unknown) => {
          if (!stop) {
            setError(err instanceof Error ? err.message : 'Could not search gallery')
          }
        })
      return () => {
        stop = true
      }
    }
    if (isBrowse(nav)) {
      void browseGallery(nav, sort, dir)
        .then((items) => {
          if (!stop) {
            setBrowse(items)
            setError(null)
          }
        })
        .catch((err: unknown) => {
          if (!stop) {
            setError(err instanceof Error ? err.message : 'Could not load cards')
          }
        })
    }
    return () => {
      stop = true
    }
  }, [visible, searching, nav, filters, sort, dir, homeReady, setNewest, pageSize, shuffle])

  function applyLibrary(library: GalleryLibrary) {
    if (isFolder(library)) {
      setFilters(EMPTY_FILTERS)
      setFolderView('galleries')
      setNav(`folder:${library.id}`)
      return
    }
    setFilters({
      ...EMPTY_FILTERS,
      q: library.query,
      scopes: library.scopes,
      models: library.models,
      loras: library.loras,
      wildcards: library.wildcards,
    })
    setNav(`library:${library.id}`)
  }

  function openCreate(parentId: string | null, kind: 'new' | 'folder') {
    setCreateParent(parentId)
    if (kind === 'folder') {
      setFolderName({ parentId, name: '' })
      return
    }
    setEdit('new')
  }

  function onBrowseOpen(name: string) {
    if (nav === 'checkpoints') {
      setFilters({ ...EMPTY_FILTERS, models: [name] })
    } else if (nav === 'loras') {
      setFilters({ ...EMPTY_FILTERS, loras: [name] })
    } else if (nav === 'wildcards') {
      setFilters({ ...EMPTY_FILTERS, wildcards: [name] })
    } else if (nav === 'tags') {
      setFilters({ ...EMPTY_FILTERS, tags: [name], q: name })
    }
  }

  function goNav(id: GallerySidebarId) {
    setNav(id)
    if (id === 'home' || id === 'libraries' || id === 'recent' || isBrowse(id) || id.startsWith('folder:')) {
      setFilters(EMPTY_FILTERS)
      if (id.startsWith('folder:')) {
        setFolderView('galleries')
      }
    } else if (id.startsWith('library:')) {
      const library = libraries.find((item) => `library:${item.id}` === id)
      if (library) {
        applyLibrary(library)
      }
    }
  }

  async function saveLibrary(value: Pick<GalleryLibrary, 'name' | 'query' | 'scopes' | 'models' | 'loras' | 'wildcards'>) {
    if (edit === 'new') {
      const created = await createGalleryLibrary({ ...value, parent_id: createParent })
      setLibraries((items) => [...items, created])
      applyLibrary(created)
    } else if (edit) {
      const updated = await updateGalleryLibrary(edit.id, value)
      setLibraries((items) => items.map((item) => (item.id === updated.id ? updated : item)))
      if (nav === `library:${updated.id}`) {
        applyLibrary(updated)
      }
    }
    setEdit(null)
    setCreateParent(null)
  }

  async function saveFolder() {
    const name = folderName?.name.trim() ?? renameFolder?.name.trim() ?? ''
    if (!name) {
      return
    }
    if (folderName) {
      const created = await createGalleryLibrary({
        name,
        query: '',
        scopes: [],
        models: [],
        loras: [],
        wildcards: [],
        kind: 'folder',
        parent_id: folderName.parentId,
      })
      setLibraries((items) => [...items, created])
      applyLibrary(created)
      setFolderName(null)
      return
    }
    if (renameFolder) {
      const updated = await updateGalleryLibrary(renameFolder.id, {
        name,
        query: '',
        scopes: [],
        models: [],
        loras: [],
        wildcards: [],
        kind: 'folder',
      })
      setLibraries((items) => items.map((item) => (item.id === updated.id ? updated : item)))
      setRenameFolder(null)
    }
  }

  async function confirmRemove() {
    if (!remove) {
      return
    }
    const gone = new Set([remove.id, ...descendantIds(libraries, remove.id)])
    await deleteGalleryLibrary(remove.id)
    setLibraries((items) => items.filter((item) => !gone.has(item.id)))
    const currentId = nav.startsWith('library:') || nav.startsWith('folder:') ? nav.split(':')[1] : ''
    if (currentId && gone.has(currentId)) {
      const parent = remove.parent_id
      setNav(parent ? `folder:${parent}` : 'libraries')
      setFilters(EMPTY_FILTERS)
    }
    setRemove(null)
  }

  function markFavorite(id: string, favorite: boolean) {
    const apply = (item: GalleryItem) => (item.id === id ? { ...item, favorite } : item)
    setResults((prev) => {
      const next = prev.map(apply)
      return filters.favorite && !favorite ? next.filter((item) => item.id !== id) : next
    })
    setHome((prev) => ({ ...prev, recent: prev.recent.map(apply) }))
    setPreview((value) => (value ? { ...value, items: value.items.map(apply) } : value))
  }

  async function onItemFavorite(item: GalleryItem) {
    const next = !item.favorite
    markFavorite(item.id, next)
    try {
      await setGalleryFavorite(item.id, next)
    } catch (err) {
      markFavorite(item.id, Boolean(item.favorite))
      toast(err instanceof Error ? err.message : 'Could not favorite', 'error')
    }
  }

  function dropItem(id: string) {
    setResults((prev) => prev.filter((item) => item.id !== id))
    setHome((prev) => ({ ...prev, recent: prev.recent.filter((item) => item.id !== id) }))
    setPreview((value) => {
      if (!value) {
        return value
      }
      const items = value.items.filter((item) => item.id !== id)
      if (!items.length) {
        return null
      }
      return { items, index: Math.min(value.index, items.length - 1) }
    })
  }

  async function confirmTrashImage() {
    if (!trashImage) {
      return
    }
    const id = trashImage.id
    setTrashImage(null)
    try {
      await removeGalleryItem(id)
      dropItem(id)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not move to trash', 'error')
    }
  }

  function onItemFileInfo(item: GalleryItem) {
    setPreview(null)
    navigate('/file-info', { state: { galleryId: item.id } })
  }

  async function onDrop(parentId: string | null, ids: string[]) {
    const next = await orderGalleryLibraries(parentId, ids)
    setLibraries(next)
  }

  const loadMore = useCallback(() => {
    if (!cursor || loadingMoreRef.current) {
      return
    }
    loadingMoreRef.current = true
    setLoadingMore(true)
    void searchGallery(searchArgs(filters, pageSize, cursor, folderImages ? folderId : ''))
      .then((data) => {
        setResults((items) => {
          const seen = new Set(items.map((item) => item.id))
          return [...items, ...data.items.filter((item) => !seen.has(item.id))]
        })
        setCursor(data.cursor)
      })
      .finally(() => {
        loadingMoreRef.current = false
        setLoadingMore(false)
      })
  }, [cursor, filters, pageSize, folderImages, folderId])

  const current = preview ? preview.items[preview.index] : null
  const scopeLabels = Object.fromEntries(scopes.map((item) => [item.id, item.name]))
  const empty = homeReady && !searching && !error && home.recent.length === 0

  if (!homeReady) {
    return <div className="h-full min-h-0 px-10 py-4" />
  }
  if (empty) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center px-10 py-4">
        <p className="text-sm text-muted">{EMPTY_COPY}</p>
      </div>
    )
  }

  return (
    <div ref={rowRef} className="flex h-full min-h-0 px-10 py-4">
      <aside className="flex min-h-0 shrink-0 flex-col" style={{ width: navWidth }}>
        <GallerySidebar
          nav={nav}
          libraries={libraries}
          onNav={goNav}
          onAdd={(parentId) => openCreate(parentId, 'new')}
          onAddFolder={(parentId) => openCreate(parentId, 'folder')}
          onEdit={(item) => (isFolder(item) ? setRenameFolder(item) : setEdit(item))}
          onRemove={setRemove}
          onDrop={(parentId, ids) => void onDrop(parentId, ids)}
        />
      </aside>
      <PaneSplitter
        value={navWidth}
        onChange={setNavWidth}
        onReset={() => setNavWidth(NAV_REM * remPx())}
        min={NAV_MIN_REM * remPx()}
        containerRef={rowRef}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <div className="flex shrink-0 flex-col gap-cluster">
          <div className="flex flex-wrap items-center gap-cluster">
            <IconButton
              className="h-toolbar"
              on={filters.favorite}
              aria-label={filters.favorite ? 'Show all images' : 'Show favorites'}
              title={filters.favorite ? 'Favorites on' : 'Favorites'}
              onClick={() => {
                if (folderId) {
                  setFolderView('images')
                }
                setFilters((value) => ({ ...value, favorite: !value.favorite }))
              }}
            >
              <AppIcon id="star" className={filters.favorite ? 'fill-current text-yellow' : ''} />
            </IconButton>
            <div className="relative min-w-48 flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-muted">
                <AppIcon id="search" size={12} />
              </span>
              <TextField
                className="h-toolbar py-0 pl-7"
                value={filters.q}
                onChange={(event) => setFilters((value) => ({ ...value, q: event.target.value }))}
                placeholder="Search tags, prompts…"
              />
            </div>
            <div className="h-toolbar min-w-48 flex-1">
              <ChipSelect
                compact
                options={scopes.map((item) => item.id)}
                value={filters.scopes}
                onChange={(next) => setFilters((value) => ({ ...value, scopes: next }))}
                chipLabel={(id) => scopeLabels[id] || id}
                placeholder="Scopes"
              />
            </div>
            <SegmentSwitch
              value={filters.media}
              tone="blue"
              options={MEDIA}
              onChange={(media) => setFilters((value) => ({ ...value, media }))}
            />
            {folderId ? (
              <SegmentSwitch
                value={folderView}
                tone="purple"
                options={[
                  { id: 'galleries', label: 'Galleries' },
                  { id: 'images', label: 'Images' },
                ]}
                onChange={(next) => {
                  setFolderView(next)
                  if (next === 'galleries' && !filtersActive(filters)) {
                    setFilters(EMPTY_FILTERS)
                  }
                }}
              />
            ) : null}
            <GallerySearchFilters
              orientation={filters.orientation}
              onChange={(orientation) => setFilters((value) => ({ ...value, orientation }))}
            />
            <IconButton
              className="h-toolbar"
              on={filters.random}
              aria-label={filters.random ? 'Turn off random order' : 'Random order'}
              title={filters.random ? 'Random order on — right-click to shuffle again' : 'Random order'}
              onClick={() => {
                if (filters.random) {
                  setFilters((value) => ({ ...value, random: false }))
                  return
                }
                if (folderId) {
                  setFolderView('images')
                }
                setFilters((value) => ({ ...value, random: true }))
                setResults([])
                setCursor('')
                setShuffle((value) => value + 1)
              }}
              onContextMenu={(event) => {
                event.preventDefault()
                if (folderId) {
                  setFolderView('images')
                }
                setFilters((value) => ({ ...value, random: true }))
                setResults([])
                setCursor('')
                setShuffle((value) => value + 1)
              }}
            >
              <AppIcon id="shuffle" />
            </IconButton>
            <ButtonControl
              tone="ghost"
              size="sm"
              className="h-toolbar"
              disabled={!searching}
              onClick={() => {
                setFilters(EMPTY_FILTERS)
                if (nav.startsWith('library:') || nav === 'recent') {
                  setNav('home')
                } else if (nav.startsWith('folder:')) {
                  setFolderView('galleries')
                }
              }}
            >
              Clear
            </ButtonControl>
          </div>
          <GalleryFilterTiles
            models={filters.models}
            loras={filters.loras}
            wildcards={filters.wildcards}
            onModels={(next) => setFilters((value) => ({ ...value, models: next }))}
            onLoras={(next) => setFilters((value) => ({ ...value, loras: next }))}
            onWildcards={(next) => setFilters((value) => ({ ...value, wildcards: next }))}
          />
        </div>
        <div className={searching ? 'flex min-h-0 flex-1 flex-col' : 'min-h-0 flex-1 overflow-y-auto'}>
          {searching ? (
            <GalleryResults
              key={String(shuffle)}
              items={results}
              error={error}
              hasNext={Boolean(cursor)}
              loadingMore={loadingMore}
              onMore={loadMore}
              onFavorite={onItemFavorite}
              onRemove={setTrashImage}
              onFileInfo={onItemFileInfo}
            />
          ) : nav === 'home' ? (
            <GalleryHome
              data={home}
              libraries={libraries}
              onOpen={(item) => setPreview({ items: home.recent, index: home.recent.indexOf(item) })}
              onRecent={() => goNav('recent')}
              onTags={() => goNav('tags')}
              onModels={() => goNav('checkpoints')}
              onLoras={() => goNav('loras')}
              onWildcards={() => goNav('wildcards')}
              onGalleries={() => goNav('libraries')}
              onTag={(tag) => setFilters({ ...EMPTY_FILTERS, q: tag, tags: [tag] })}
              onModel={(name) => setFilters({ ...EMPTY_FILTERS, models: [name] })}
              onLora={(name) => setFilters({ ...EMPTY_FILTERS, loras: [name] })}
              onWildcard={(name) => setFilters({ ...EMPTY_FILTERS, wildcards: [name] })}
              onLibrary={applyLibrary}
              onFavorite={onItemFavorite}
              onRemove={setTrashImage}
              onFileInfo={onItemFileInfo}
            />
          ) : isBrowse(nav) ? (
            <GalleryBrowse kind={nav} items={browse} error={error} onOpen={onBrowseOpen} />
          ) : (
            <GalleryLibraries
              items={libraries}
              parentId={folderId || null}
              trail={folderId ? ancestorsOf(libraries, folderId).concat(libraries.find((item) => item.id === folderId) ?? []) : []}
              onOpen={applyLibrary}
              onOpenFolder={applyLibrary}
              onTrail={(id) => {
                setFilters(EMPTY_FILTERS)
                setFolderView('galleries')
                setNav(id ? `folder:${id}` : 'libraries')
              }}
              onAdd={() => openCreate(folderId || null, 'new')}
              onAddFolder={() => openCreate(folderId || null, 'folder')}
              onEdit={(item) => (isFolder(item) ? setRenameFolder(item) : setEdit(item))}
              onRemove={setRemove}
              onDrop={(parent, ids) => void onDrop(parent, ids)}
            />
          )}
        </div>
      </div>
      {current ? (
        <LightboxView
          src={galleryItemImageUrl(current.id)}
          type={current.media_kind === 'video' ? 'video' : undefined}
          alt="Generated"
          resetKey={current.id}
          many={preview != null && preview.items.length > 1}
          toolbar={
            <GalleryImageToolbar
              favorite={Boolean(current.favorite)}
              onFileInfo={() => onItemFileInfo(current)}
              onFavorite={() => void onItemFavorite(current)}
              onRemove={() => setTrashImage(current)}
            />
          }
          onClose={() => setPreview(null)}
          onPrev={() =>
            setPreview((value) =>
              value ? { ...value, index: (value.index + value.items.length - 1) % value.items.length } : value,
            )
          }
          onNext={() =>
            setPreview((value) => (value ? { ...value, index: (value.index + 1) % value.items.length } : value))
          }
        />
      ) : null}
      {edit ? (
        <GalleryEditDialog
          title={edit === 'new' ? 'New gallery' : 'Edit gallery'}
          initial={edit === 'new' ? undefined : edit}
          scopeOptions={scopes.map((item) => ({ id: item.id, name: item.name }))}
          onSave={(value) => void saveLibrary(value)}
          onClose={() => {
            setEdit(null)
            setCreateParent(null)
          }}
        />
      ) : null}
      {folderName ? (
        <NameDialog
          title="New folder"
          name={folderName.name}
          onName={(name) => setFolderName((value) => (value ? { ...value, name } : value))}
          onClose={() => setFolderName(null)}
          selectAllOnOpen
          actions={[
            { label: 'Cancel', kind: 'ghost', onClick: () => setFolderName(null) },
            { label: 'Create', kind: 'primary', submit: true, disabled: !folderName.name.trim(), onClick: () => void saveFolder() },
          ]}
        />
      ) : null}
      {renameFolder ? (
        <NameDialog
          title="Rename folder"
          name={renameFolder.name}
          onName={(name) => setRenameFolder((value) => (value ? { ...value, name } : value))}
          onClose={() => setRenameFolder(null)}
          selectAllOnOpen
          actions={[
            { label: 'Cancel', kind: 'ghost', onClick: () => setRenameFolder(null) },
            { label: 'Save', kind: 'primary', submit: true, disabled: !renameFolder.name.trim(), onClick: () => void saveFolder() },
          ]}
        />
      ) : null}
      {remove ? (
        <ConfirmDialog
          title={`Remove ${remove.name}?`}
          body={isFolder(remove) ? 'This deletes the folder and saved galleries inside it, not the images.' : 'This deletes the saved gallery, not the images.'}
          onClose={() => setRemove(null)}
          actions={[
            { label: 'Cancel', onClick: () => setRemove(null), kind: 'ghost' },
            { label: 'Remove', onClick: () => void confirmRemove(), kind: 'primary', danger: true },
          ]}
        />
      ) : null}
      {trashImage ? (
        <ConfirmDialog
          title="Move to Trash?"
          body="This can be restored from Settings → Trash."
          onClose={() => setTrashImage(null)}
          actions={[
            { label: 'Cancel', onClick: () => setTrashImage(null), kind: 'ghost' },
            { label: 'Remove', onClick: () => void confirmTrashImage(), kind: 'primary', danger: true },
          ]}
        />
      ) : null}
    </div>
  )
}
