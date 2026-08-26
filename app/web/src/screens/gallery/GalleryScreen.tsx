import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { PaneSplitter } from '@/components/chrome/PaneSplitter.tsx'
import { ChipSelect } from '@/components/primitives/ChipSelect.tsx'
import { ConfirmDialog } from '@/components/primitives/Dialog.tsx'
import { LightboxView } from '@/components/models/LightboxView.tsx'
import {
  browseGallery,
  createGalleryLibrary,
  deleteGalleryLibrary,
  galleryItemImageUrl,
  getGalleryHome,
  getThumbScopes,
  listGalleryLibraries,
  searchGallery,
  updateGalleryLibrary,
  type GalleryBrowseItem,
  type GalleryHome as GalleryHomeData,
  type GalleryItem,
  type GalleryLibrary,
  type ThumbScope,
} from '@/lib/api.ts'
import { galleryBrowseKey, useSettingsStore, type GalleryBrowseKind } from '@/stores/settingsStore.ts'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { GalleryBrowse } from './GalleryBrowse.tsx'
import { GalleryEditDialog } from './GalleryEditDialog.tsx'
import { GalleryHome } from './GalleryHome.tsx'
import { GalleryLibraries } from './GalleryLibraries.tsx'
import { GalleryNav } from './GalleryNav.tsx'
import { GalleryResults } from './GalleryResults.tsx'
import { EMPTY_FILTERS, filtersActive, newestStamp, type GalleryFilters, type GalleryMedia, type GalleryNavId } from './filters.ts'
import { useGalleryLive } from './useGalleryLive.ts'

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

function isBrowse(nav: GalleryNavId): nav is GalleryBrowseKind {
  return nav === 'checkpoints' || nav === 'loras' || nav === 'wildcards'
}

export function GalleryScreen() {
  const visible = useLocation().pathname === '/gallery'
  const rowRef = useRef<HTMLDivElement>(null)
  const [navWidth, setNavWidth] = useState(NAV_REM * 16)
  const [nav, setNav] = useState<GalleryNavId>('home')
  const [filters, setFilters] = useState<GalleryFilters>(EMPTY_FILTERS)
  const [home, setHome] = useState<GalleryHomeData>(EMPTY_HOME)
  const [homeReady, setHomeReady] = useState(false)
  const [results, setResults] = useState<GalleryItem[]>([])
  const [cursor, setCursor] = useState('')
  const [browse, setBrowse] = useState<GalleryBrowseItem[]>([])
  const [libraries, setLibraries] = useState<GalleryLibrary[]>([])
  const [scopes, setScopes] = useState<ThumbScope[]>([])
  const [models, setModels] = useState<string[]>([])
  const [loras, setLoras] = useState<string[]>([])
  const [wildcards, setWildcards] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [preview, setPreview] = useState<{ items: GalleryItem[]; index: number } | null>(null)
  const [edit, setEdit] = useState<GalleryLibrary | 'new' | null>(null)
  const [remove, setRemove] = useState<GalleryLibrary | null>(null)
  const searching = filtersActive(filters) || nav.startsWith('library:')
  const share = useSettingsStore((s) => s.galleryBrowseShare)
  const browseKey = isBrowse(nav) ? galleryBrowseKey(nav, share) : ''
  const sort = useSettingsStore((s) => (browseKey ? s.galleryBrowseSort[browseKey] ?? 'recent' : 'recent'))
  const dir = useSettingsStore((s) => (browseKey ? s.galleryBrowseDir[browseKey] ?? 'desc' : 'desc'))

  const reload = useCallback(() => setTick((value) => value + 1), [])
  const setNewest = useGalleryLive(visible, reload)

  useEffect(() => {
    if (!visible) {
      return
    }
    void Promise.all([
      listGalleryLibraries(),
      getThumbScopes(),
      browseGallery('checkpoints'),
      browseGallery('loras'),
      browseGallery('wildcards'),
    ])
      .then(([nextLibraries, nextScopes, nextModels, nextLoras, nextWildcards]) => {
        setLibraries(nextLibraries)
        setScopes(nextScopes.filter((item) => item.id !== 'global'))
        setModels(nextModels.map((item) => item.name))
        setLoras(nextLoras.map((item) => item.name))
        setWildcards(nextWildcards.map((item) => item.name))
      })
      .catch(() => undefined)
  }, [visible, tick])

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
      void searchGallery({
        q: filters.q,
        tags: filters.tags,
        scopes: filters.scopes,
        models: filters.models,
        loras: filters.loras,
        wildcards: filters.wildcards,
        media: filters.media,
      })
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
  }, [visible, tick, searching, nav, filters, sort, dir, homeReady, setNewest])

  function applyLibrary(library: GalleryLibrary) {
    setFilters({
      ...EMPTY_FILTERS,
      q: library.query,
      scopes: library.scopes,
      models: library.models,
    })
    setNav(`library:${library.id}`)
  }

  function onBrowseOpen(name: string) {
    if (nav === 'checkpoints') {
      setFilters({ ...EMPTY_FILTERS, models: [name] })
    } else if (nav === 'loras') {
      setFilters({ ...EMPTY_FILTERS, loras: [name] })
    } else if (nav === 'wildcards') {
      setFilters({ ...EMPTY_FILTERS, wildcards: [name] })
    }
  }

  async function saveLibrary(value: Pick<GalleryLibrary, 'name' | 'query' | 'scopes' | 'models'>) {
    if (edit === 'new') {
      const created = await createGalleryLibrary(value)
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
  }

  async function confirmRemove() {
    if (!remove) {
      return
    }
    await deleteGalleryLibrary(remove.id)
    setLibraries((items) => items.filter((item) => item.id !== remove.id))
    if (nav === `library:${remove.id}`) {
      setNav('libraries')
      setFilters(EMPTY_FILTERS)
    }
    setRemove(null)
  }

  function loadMore() {
    if (!cursor) {
      return
    }
    void searchGallery({
      q: filters.q,
      tags: filters.tags,
      scopes: filters.scopes,
      models: filters.models,
      loras: filters.loras,
      wildcards: filters.wildcards,
      media: filters.media,
      cursor,
    }).then((data) => {
      setResults((items) => [...items, ...data.items])
      setCursor(data.cursor)
    })
  }

  const current = preview ? preview.items[preview.index] : null
  const scopeLabels = Object.fromEntries(scopes.map((item) => [item.id, item.name]))
  const empty = homeReady && !searching && !error && home.recent.length === 0

  if (!homeReady) {
    return <div className="h-full min-h-0 px-6 py-4" />
  }
  if (empty) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center px-6 py-4">
        <p className="text-sm text-muted">{EMPTY_COPY}</p>
      </div>
    )
  }

  return (
    <div ref={rowRef} className="flex h-full min-h-0 px-6 py-4">
      <aside className="flex min-h-0 shrink-0 flex-col pr-3" style={{ width: navWidth }}>
        <GalleryNav
          nav={nav}
          libraries={libraries}
          onNav={(id) => {
            setNav(id)
            if (id === 'home' || id === 'libraries' || isBrowse(id)) {
              setFilters(EMPTY_FILTERS)
            } else if (id.startsWith('library:')) {
              const library = libraries.find((item) => `library:${item.id}` === id)
              if (library) {
                applyLibrary(library)
              }
            }
          }}
          onAdd={() => setEdit('new')}
          onEdit={setEdit}
          onRemove={setRemove}
        />
      </aside>
      <PaneSplitter
        value={navWidth}
        onChange={setNavWidth}
        onReset={() => setNavWidth(NAV_REM * remPx())}
        min={NAV_MIN_REM * remPx()}
        containerRef={rowRef}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 pl-4">
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-muted">
              <AppIcon id="search" size={12} />
            </span>
            <input
              className="h-8 w-full rounded border border-line bg-field py-0 pr-2 pl-7 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
              value={filters.q}
              onChange={(event) => setFilters((value) => ({ ...value, q: event.target.value }))}
              placeholder="Search tags, prompts…"
            />
          </div>
          <div className="flex h-8 items-stretch gap-1">
            {MEDIA.map((item) => (
              <button
                key={item.id}
                type="button"
                className={[
                  'rounded border px-2 text-sm',
                  filters.media === item.id ? 'border-accent bg-accent text-ink' : 'border-line bg-field text-muted hover:text-ink',
                ].join(' ')}
                onClick={() => setFilters((value) => ({ ...value, media: item.id }))}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="h-8 min-w-36 w-44">
            <ChipSelect
              compact
              options={scopes.map((item) => item.id)}
              value={filters.scopes}
              onChange={(next) => setFilters((value) => ({ ...value, scopes: next }))}
              chipLabel={(id) => scopeLabels[id] || id}
              placeholder="Scopes"
            />
          </div>
          <div className="h-8 min-w-36 w-44">
            <ChipSelect
              compact
              allowCustom
              options={models}
              value={filters.models}
              onChange={(next) => setFilters((value) => ({ ...value, models: next }))}
              placeholder="Models"
            />
          </div>
          <div className="h-8 min-w-36 w-44">
            <ChipSelect
              compact
              allowCustom
              options={loras}
              value={filters.loras}
              onChange={(next) => setFilters((value) => ({ ...value, loras: next }))}
              placeholder="LoRAs"
            />
          </div>
          <div className="h-8 min-w-36 w-44">
            <ChipSelect
              compact
              allowCustom
              options={wildcards}
              value={filters.wildcards}
              onChange={(next) => setFilters((value) => ({ ...value, wildcards: next }))}
              placeholder="Wildcards"
            />
          </div>
          {searching ? (
            <button
              type="button"
              className="h-8 rounded px-2 text-sm text-muted hover:text-ink"
              onClick={() => {
                setFilters(EMPTY_FILTERS)
                if (nav.startsWith('library:')) {
                  setNav('home')
                }
              }}
            >
              Clear
            </button>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {searching ? (
            <GalleryResults items={results} error={error} cursor={cursor} onMore={loadMore} />
          ) : nav === 'home' ? (
            <GalleryHome
              data={home}
              libraries={libraries}
              onOpen={(item) => setPreview({ items: home.recent, index: home.recent.indexOf(item) })}
              onTag={(tag) => setFilters({ ...EMPTY_FILTERS, q: tag, tags: [tag] })}
              onModel={(name) => setFilters({ ...EMPTY_FILTERS, models: [name] })}
              onLora={(name) => setFilters({ ...EMPTY_FILTERS, loras: [name] })}
              onWildcard={(name) => setFilters({ ...EMPTY_FILTERS, wildcards: [name] })}
              onLibrary={applyLibrary}
            />
          ) : isBrowse(nav) ? (
            <GalleryBrowse kind={nav} items={browse} error={error} onOpen={onBrowseOpen} />
          ) : (
            <GalleryLibraries
              items={libraries}
              onOpen={applyLibrary}
              onAdd={() => setEdit('new')}
              onEdit={setEdit}
              onRemove={setRemove}
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
          modelOptions={models}
          onSave={(value) => void saveLibrary(value)}
          onClose={() => setEdit(null)}
        />
      ) : null}
      {remove ? (
        <ConfirmDialog
          title={`Remove ${remove.name}?`}
          body="This deletes the saved gallery, not the images."
          onClose={() => setRemove(null)}
          actions={[
            { label: 'Cancel', onClick: () => setRemove(null), kind: 'ghost' },
            { label: 'Remove', onClick: () => void confirmRemove(), kind: 'primary', danger: true },
          ]}
        />
      ) : null}
    </div>
  )
}
