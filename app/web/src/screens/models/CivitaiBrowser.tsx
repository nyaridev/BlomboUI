import { ChipSelect } from '@/components/ChipSelect.tsx'
import { AppIcon } from '@/components/AppIcon.tsx'
import { SelectField } from '@/components/SelectField.tsx'
import { listCivitaiModels, type CivitaiModel, type CivitaiSort } from '@/lib/api.ts'
import {
  CIVITAI_CATEGORIES,
  CIVITAI_PERIODS,
  CIVITAI_SORTS,
  CIVITAI_TYPES,
  type CivitaiBrowse,
  type CivitaiTriState,
} from '@/lib/civitaiBrowse.ts'
import { dropCivitaiPage, loadCivitaiPage } from '@/lib/civitaiPageCache.ts'
import { isCivitaiModelDownloaded } from '@/lib/civitaiDownloaded.ts'
import { pickVersionId } from '@/lib/civitaiVersion.ts'
import { filterTypeSections, MODEL_TYPE_SECTIONS } from '@/lib/modelTypes.ts'
import { CivitaiModelView } from './CivitaiModelView.tsx'
import { CivitaiNavBar } from './CivitaiNavBar.tsx'
import { CivitaiTile } from './CivitaiTile.tsx'
import { useModelsStore } from '@/stores/modelsStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { toast } from '@/stores/toastStore.ts'
import { Link } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'

const TYPE_LABELS: Record<string, string> = {
  TextualInversion: 'Embedding',
  AestheticGradient: 'Aesthetic Gradient',
  LoCon: 'LyCORIS',
  MotionModule: 'Motion',
}

type StatusKey = 'earlyAccess' | 'supportsGeneration' | 'fromPlatform'

const STATUS_FILTERS: { key: StatusKey; label: string }[] = [
  { key: 'earlyAccess', label: 'Early Access' },
  { key: 'supportsGeneration', label: 'On-site Generation' },
  { key: 'fromPlatform', label: 'Made On-site' },
]

function chipClass(active: boolean) {
  return [
    'rounded border px-2 py-1 text-xs',
    active ? 'border-accent bg-accent text-ink' : 'border-line bg-field text-muted hover:text-ink',
  ].join(' ')
}

function nextTriState(value: CivitaiTriState): CivitaiTriState {
  return value === 'off' ? 'include' : value === 'include' ? 'exclude' : 'off'
}

function triStateValue(value: CivitaiTriState): boolean | undefined {
  return value === 'off' ? undefined : value === 'include'
}

function statusClass(value: CivitaiTriState) {
  if (value === 'include') {
    return 'border-accent bg-accent text-ink'
  }
  if (value === 'exclude') {
    return 'border-red bg-red/20 text-red-bright'
  }
  return 'border-line bg-field text-muted hover:text-ink'
}

function LoadingCircle({ label }: { label: string }) {
  return (
    <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-muted" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-ink" />
      <span>{label}</span>
    </div>
  )
}

export function CivitaiBrowser() {
  const loaded = useSettingsStore((state) => state.loaded)
  const apiKey = useSettingsStore((state) => state.civitaiApiKey)
  const site = useSettingsStore((state) => state.civitaiSite)
  const hiddenModelTypes = useSettingsStore((state) => state.hiddenModelTypes) ?? []
  const browse = useSettingsStore((state) => state.civitaiBrowse)
  const setCivitaiBrowse = useSettingsStore((state) => state.setCivitaiBrowse)
  const tabs = useSettingsStore((state) => state.civitaiTabs)
  const activeId = useSettingsStore((state) => state.civitaiTabId)
  const setCivitaiTabs = useSettingsStore((state) => state.setCivitaiTabs)
  const setCivitaiTabId = useSettingsStore((state) => state.setCivitaiTabId)
  const checkpoints = useModelsStore((state) => state.checkpoints)
  const loras = useModelsStore((state) => state.loras)
  const vae = useModelsStore((state) => state.vae)
  const controlnet = useModelsStore((state) => state.controlnet)
  const embeddings = useModelsStore((state) => state.embeddings)
  const wildcards = useModelsStore((state) => state.wildcards)
  const localModels = useMemo(
    () => [...checkpoints, ...loras, ...vae, ...controlnet, ...embeddings, ...wildcards],
    [checkpoints, controlnet, embeddings, loras, vae, wildcards],
  )
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [cursor, setCursor] = useState<string | undefined>()
  const [cursorHistory, setCursorHistory] = useState<string[]>([])
  const [nextCursor, setNextCursor] = useState<string | undefined>()
  const [items, setItems] = useState<CivitaiModel[]>([])
  const [hasNext, setHasNext] = useState(false)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const request = useRef(0)
  const filtersRef = useRef<HTMLDivElement>(null)
  const baseModelOptions = filterTypeSections(
    MODEL_TYPE_SECTIONS,
    (item) => !hiddenModelTypes.includes(item) || browse.baseModels.includes(item),
  )

  function resetPage() {
    setPage(1)
    setCursor(undefined)
    setCursorHistory([])
    setNextCursor(undefined)
  }

  function updateBrowse(patch: Partial<CivitaiBrowse>) {
    setCivitaiBrowse(patch)
    resetPage()
  }

  function setStatus(key: StatusKey) {
    updateBrowse({ [key]: nextTriState(browse[key]) })
  }

  function openTab(item: CivitaiModel, focus: boolean) {
    const store = useSettingsStore.getState()
    const current = store.civitaiTabs
    const initialVersionId = pickVersionId(item.versions || [], store.civitaiBrowse.baseModels)
    const next = current.some((tab) => tab.id === item.id)
      ? current
      : [
          ...current,
          {
            id: item.id,
            name: item.name,
            ...(initialVersionId === undefined ? {} : { initialVersionId, versionId: initialVersionId }),
          },
        ]
    if (next !== current) {
      store.setCivitaiTabs(next)
    }
    void loadCivitaiPage(item.id, store.civitaiBrowse.baseModels)
    if (focus) {
      store.setCivitaiTabId(item.id)
    }
  }

  function closeTab(id: number) {
    const store = useSettingsStore.getState()
    const next = store.civitaiTabs.filter((tab) => tab.id !== id)
    store.setCivitaiTabs(next)
    dropCivitaiPage(id)
    if (store.civitaiTabId === id) {
      store.setCivitaiTabId(next[next.length - 1]?.id ?? null)
    }
  }

  const activeFilterCount =
    (browse.period !== 'AllTime' ? 1 : 0) +
    ([browse.earlyAccess, browse.supportsGeneration, browse.fromPlatform] as CivitaiTriState[]).filter(
      (value) => value !== 'off',
    ).length

  useEffect(() => {
    if (!loaded) {
      return
    }
    if (!apiKey.trim()) {
      setItems([])
      setHasNext(false)
      setNextCursor(undefined)
      setError('')
      return
    }
    const id = ++request.current
    const timer = window.setTimeout(() => {
      setBusy(true)
      setError('')
      void listCivitaiModels({
        query: browse.query,
        types: browse.types,
        baseModels: browse.baseModels,
        sort: browse.sort,
        period: browse.period,
        page,
        cursor,
        earlyAccess: triStateValue(browse.earlyAccess),
        supportsGeneration: triStateValue(browse.supportsGeneration),
        fromPlatform: triStateValue(browse.fromPlatform),
        nsfw: true,
        tag: browse.tag,
      })
        .then((result) => {
          if (id !== request.current) {
            return
          }
          setItems(result.items)
          setHasNext(result.hasNext)
          setNextCursor(result.nextCursor || undefined)
        })
        .catch((err) => {
          if (id === request.current) {
            setItems([])
            setHasNext(false)
            setError(err instanceof Error ? err.message : 'Could not load CivitAI models')
          }
        })
        .finally(() => {
          if (id === request.current) {
            setBusy(false)
          }
        })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [
    apiKey,
    browse.baseModels,
    browse.earlyAccess,
    browse.fromPlatform,
    browse.period,
    browse.query,
    browse.sort,
    browse.supportsGeneration,
    browse.tag,
    browse.types,
    cursor,
    loaded,
    page,
  ])

  useEffect(() => {
    if (!filtersOpen) {
      return
    }
    function onDoc(event: MouseEvent) {
      if (!filtersRef.current?.contains(event.target as Node)) {
        setFiltersOpen(false)
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setFiltersOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [filtersOpen])

  useEffect(() => {
    for (const tab of tabs) {
      void loadCivitaiPage(tab.id, browse.baseModels)
    }
  }, [browse.baseModels, tabs])

  if (!apiKey.trim()) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        <p>
          Add a CivitAI API key in{' '}
          <Link to="/settings" className="text-purple-bright underline decoration-purple-bright/50 hover:decoration-purple-bright">
            Settings → General
          </Link>{' '}
          to browse models.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <CivitaiNavBar
        tabs={tabs}
        activeId={activeId}
        onHome={() => setCivitaiTabId(null)}
        onSelect={setCivitaiTabId}
        onClose={closeTab}
        onClear={() => {
          for (const tab of tabs) {
            dropCivitaiPage(tab.id)
          }
          setCivitaiTabs([])
          setCivitaiTabId(null)
        }}
      />
      {activeId === null ? (
      <div className="flex shrink-0 flex-col gap-2">
        <div className="flex min-w-0 items-stretch gap-2">
          <input
            className="min-w-48 flex-1 rounded border border-line bg-field px-2 py-1.5 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
            value={browse.query}
            onChange={(event) => updateBrowse({ query: event.target.value })}
            placeholder="Search CivitAI models…"
            aria-label="Search CivitAI models"
          />
          <SelectField
            className="w-44 shrink-0"
            icon="arrow-up-down"
            value={browse.sort}
            onChange={(value) => updateBrowse({ sort: value as CivitaiSort })}
            options={[...CIVITAI_SORTS]}
          />
          <div ref={filtersRef} className="relative shrink-0">
            <button
              type="button"
              className={[
                'inline-flex h-full items-center gap-1 rounded border px-2.5 text-sm',
                activeFilterCount > 0
                  ? 'border-accent bg-accent text-ink'
                  : filtersOpen
                    ? 'border-accent bg-field text-ink'
                    : 'border-line bg-field text-ink hover:text-ink',
              ].join(' ')}
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
              <AppIcon id={filtersOpen ? 'chevron-up' : 'chevron-down'} size={12} />
            </button>
            {filtersOpen ? (
              <div className="absolute right-0 top-[calc(100%+0.25rem)] z-40 w-[min(92vw,24rem)] overflow-visible rounded border border-line bg-panel p-3 shadow-[0_8px_24px_rgb(0_0_0_/_0.45)]">
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="mb-1.5 text-xs text-muted">Time period</p>
                    <div className="flex flex-wrap gap-1.5">
                      {CIVITAI_PERIODS.map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          className={chipClass(browse.period === item.value)}
                          onClick={() => updateBrowse({ period: item.value })}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs text-muted">Model status</p>
                    <div className="flex flex-wrap gap-1.5">
                      {STATUS_FILTERS.map((item) => {
                        const value = browse[item.key]
                        return (
                          <button
                            key={item.key}
                            type="button"
                            className={['rounded border px-2 py-1 text-xs', statusClass(value)].join(' ')}
                            title="Click once to include, twice to exclude, and again to clear"
                            aria-label={`${item.label}: ${value}`}
                            onClick={() => setStatus(item.key)}
                          >
                            {value === 'include' ? '✓ ' : value === 'exclude' ? '− ' : ''}
                            {item.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className={[
              'inline-flex h-full shrink-0 items-center gap-1 rounded border px-2.5 text-sm',
              browse.nsfw ? 'border-accent bg-accent text-ink' : 'border-line bg-field text-muted hover:text-ink',
            ].join(' ')}
            aria-pressed={browse.nsfw}
            title={browse.nsfw ? 'Blur mature previews' : 'Show mature previews'}
            onClick={() => setCivitaiBrowse({ nsfw: !browse.nsfw })}
          >
            <AppIcon id={browse.nsfw ? 'eye' : 'eye-off'} size={14} />
            NSFW
          </button>
        </div>
        <div className="flex min-w-0 flex-wrap items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {CIVITAI_CATEGORIES.map((item) => (
              <button
                key={item.label}
                type="button"
                className={chipClass(browse.tag === item.value)}
                onClick={() => updateBrowse({ tag: item.value })}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex min-h-9 min-w-0 shrink-0 items-stretch gap-2">
            <div className="w-56 min-w-0">
              <ChipSelect
                options={CIVITAI_TYPES}
                value={browse.types}
                onChange={(value) => updateBrowse({ types: value })}
                placeholder="Model types"
                chipLabel={(value) => TYPE_LABELS[value] || value}
              />
            </div>
            <div className="w-56 min-w-0">
              <ChipSelect
                options={baseModelOptions}
                value={browse.baseModels}
                onChange={(value) => updateBrowse({ baseModels: value })}
                placeholder="Base model"
              />
            </div>
          </div>
        </div>
      </div>
      ) : null}
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={tab.id === activeId ? 'flex min-h-0 min-w-0 flex-1 flex-col' : 'hidden'}
        >
          <CivitaiModelView modelId={tab.id} preferredBases={browse.baseModels} />
        </div>
      ))}
      {activeId === null ? (
        <>
          {error ? <p className="text-sm text-red-bright">{error}</p> : null}
          {busy && !items.length ? <LoadingCircle label="Loading CivitAI models…" /> : null}
          {!busy && !error && !items.length ? <p className="text-sm text-muted">No models found.</p> : null}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">
              {items.map((item) => (
                <CivitaiTile
                  key={item.id}
                  item={item}
                  nsfw={browse.nsfw}
                  downloaded={isCivitaiModelDownloaded(item, localModels)}
                  site={site}
                  preferredBases={browse.baseModels}
                  onOpen={() => openTab(item, true)}
                  onOpenBackground={() => openTab(item, false)}
                  onDownload={() => toast("Download isn't implemented yet")}
                />
              ))}
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-center gap-2">
            <button
              type="button"
              className="rounded border border-line bg-field px-2 py-1 text-xs text-ink disabled:opacity-40"
              disabled={page <= 1 || busy}
              onClick={() => {
                if (cursorHistory.length) {
                  const previous = cursorHistory[cursorHistory.length - 1] || undefined
                  setCursorHistory((current) => current.slice(0, -1))
                  setCursor(previous)
                }
                setPage((current) => Math.max(1, current - 1))
              }}
            >
              Previous
            </button>
            <span className="text-xs tabular-nums text-muted">Page {page}</span>
            <button
              type="button"
              className="rounded border border-line bg-field px-2 py-1 text-xs text-ink disabled:opacity-40"
              disabled={!hasNext || busy}
              onClick={() => {
                setCursorHistory((current) => [...current, cursor || ''])
                setCursor(nextCursor)
                setPage((current) => current + 1)
              }}
            >
              Next
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
