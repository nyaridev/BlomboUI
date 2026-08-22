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
import { CivitaiDownloadDialog } from './CivitaiDownloadDialog.tsx'
import { CivitaiErrorState } from './CivitaiErrorState.tsx'
import { CivitaiNavBar } from './CivitaiNavBar.tsx'
import { CivitaiTile } from './CivitaiTile.tsx'
import { useModelsStore } from '@/stores/modelsStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
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

const CIVITAI_RETRY_DELAY = 2000

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

type CivitaiFilterDraft = Pick<
  CivitaiBrowse,
  'period' | 'tag' | 'types' | 'baseModels' | 'earlyAccess' | 'supportsGeneration' | 'fromPlatform'
>

function filterDraftOf(browse: CivitaiBrowse): CivitaiFilterDraft {
  return {
    period: browse.period,
    tag: browse.tag,
    types: browse.types,
    baseModels: browse.baseModels,
    earlyAccess: browse.earlyAccess,
    supportsGeneration: browse.supportsGeneration,
    fromPlatform: browse.fromPlatform,
  }
}

function filterDraftEqual(left: CivitaiFilterDraft, right: CivitaiFilterDraft) {
  return (
    left.period === right.period &&
    left.tag === right.tag &&
    left.earlyAccess === right.earlyAccess &&
    left.supportsGeneration === right.supportsGeneration &&
    left.fromPlatform === right.fromPlatform &&
    left.types.length === right.types.length &&
    left.types.every((value) => right.types.includes(value)) &&
    left.baseModels.length === right.baseModels.length &&
    left.baseModels.every((value) => right.baseModels.includes(value))
  )
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
  const autoRetry = useSettingsStore((state) => state.civitaiAutoRetry)
  const autoRetryCount = useSettingsStore((state) => state.civitaiAutoRetryCount)
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
  const [filterDraft, setFilterDraft] = useState<CivitaiFilterDraft>(() => filterDraftOf(browse))
  const [page, setPage] = useState(1)
  const [cursor, setCursor] = useState<string | undefined>()
  const [cursorHistory, setCursorHistory] = useState<string[]>([])
  const [nextCursor, setNextCursor] = useState<string | undefined>()
  const [items, setItems] = useState<CivitaiModel[]>([])
  const [hasNext, setHasNext] = useState(false)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const [autoRetrying, setAutoRetrying] = useState(false)
  const [retryAttempt, setRetryAttempt] = useState(0)
  const [retryMessage, setRetryMessage] = useState('')
  const [downloadRequest, setDownloadRequest] = useState<{ modelId: number; versionId?: number } | null>(null)
  const [downloadingIds, setDownloadingIds] = useState<Set<number>>(() => new Set())
  const [sessionDownloadedIds, setSessionDownloadedIds] = useState<Set<number>>(() => new Set())
  const request = useRef(0)
  const retryTimer = useRef<number | null>(null)
  const retryAbort = useRef<AbortController | null>(null)
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

  function clearRetryTimer() {
    if (retryTimer.current !== null) {
      window.clearTimeout(retryTimer.current)
      retryTimer.current = null
    }
  }

  function cancelAutoRetry() {
    request.current += 1
    clearRetryTimer()
    retryAbort.current?.abort()
    retryAbort.current = null
    setAutoRetrying(false)
    setRetryAttempt(0)
    setBusy(false)
    setError(retryMessage || 'CivitAI search retry cancelled.')
  }

  function setStatus(key: StatusKey) {
    setFilterDraft((current) => ({ ...current, [key]: nextTriState(current[key]) }))
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

  function openDownload(item: CivitaiModel) {
    if (downloadingIds.has(item.id)) {
      return
    }
    const store = useSettingsStore.getState()
    setDownloadRequest({
      modelId: item.id,
      versionId: pickVersionId(item.versions || [], store.civitaiBrowse.baseModels),
    })
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
  const filtersChanged = !filterDraftEqual(filterDraft, filterDraftOf(browse))

  useEffect(() => {
    if (loaded) {
      setFilterDraft(filterDraftOf(useSettingsStore.getState().civitaiBrowse))
    }
  }, [loaded])

  useEffect(() => {
    if (!loaded) {
      return
    }
    setAutoRetrying(false)
    setRetryAttempt(0)
    setRetryMessage('')
    if (!apiKey.trim()) {
      setItems([])
      setHasNext(false)
      setNextCursor(undefined)
      setError('')
      setBusy(false)
      return
    }
    const id = ++request.current
    const abort = new AbortController()
    retryAbort.current = abort
    let stopped = false

    function run(attempt: number) {
      if (stopped || id !== request.current) {
        return
      }
      retryTimer.current = null
      let retryScheduled = false
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
        signal: abort.signal,
      })
        .then((result) => {
          if (stopped || id !== request.current) {
            return
          }
          setItems(result.items)
          setHasNext(result.hasNext)
          setNextCursor(result.nextCursor || undefined)
          setError('')
          setAutoRetrying(false)
          setRetryAttempt(0)
          setRetryMessage('')
        })
        .catch((err) => {
          if (stopped || id !== request.current) {
            return
          }
          const message = err instanceof Error ? err.message : 'Could not load CivitAI models'
          if (autoRetry && attempt < autoRetryCount) {
            retryScheduled = true
            setAutoRetrying(true)
            setRetryAttempt(attempt + 1)
            setRetryMessage(message)
            retryTimer.current = window.setTimeout(() => run(attempt + 1), CIVITAI_RETRY_DELAY)
            return
          }
          setItems([])
          setHasNext(false)
          setError(message)
          setAutoRetrying(false)
          setRetryAttempt(0)
        })
        .finally(() => {
          if (!stopped && id === request.current && !retryScheduled) {
            setBusy(false)
          }
        })
    }

    const timer = window.setTimeout(() => {
      if (!stopped && id === request.current) {
        setBusy(true)
        setError('')
        run(0)
      }
    }, 250)
    return () => {
      stopped = true
      window.clearTimeout(timer)
      abort.abort()
      if (retryAbort.current === abort) {
        retryAbort.current = null
      }
      if (retryTimer.current !== null) {
        window.clearTimeout(retryTimer.current)
        retryTimer.current = null
      }
    }
  }, [
    apiKey,
    autoRetry,
    autoRetryCount,
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
    retryCount,
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
      {autoRetrying ? (
        <div className="flex shrink-0 items-center justify-between gap-3 rounded border border-orange/50 bg-orange/10 px-2.5 py-2 text-xs">
          <div className="min-w-0">
            <p className="text-orange-bright" role="status">
              Retrying CivitAI search ({retryAttempt}/{autoRetryCount})…
            </p>
            {retryMessage ? <p className="truncate text-muted">{retryMessage}</p> : null}
          </div>
          <button
            type="button"
            className="shrink-0 rounded border border-line bg-field px-2 py-1 text-ink hover:bg-line"
            onClick={cancelAutoRetry}
          >
            Cancel auto-retry
          </button>
        </div>
      ) : null}
      {activeId === null ? (
      <div className="flex shrink-0 flex-col gap-2">
        <div className="flex min-w-0 items-stretch gap-2">
          <div className="relative min-w-48 flex-1">
            <AppIcon id="search" size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
            <input
              className="w-full rounded border border-line bg-field py-1.5 pl-8 pr-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
              value={browse.query}
              onChange={(event) => updateBrowse({ query: event.target.value })}
              placeholder="Search CivitAI models…"
              aria-label="Search CivitAI models"
            />
          </div>
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
                          className={chipClass(filterDraft.period === item.value)}
                          onClick={() => setFilterDraft((current) => ({ ...current, period: item.value }))}
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
                        const value = filterDraft[item.key]
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
                className={chipClass(filterDraft.tag === item.value)}
                onClick={() => setFilterDraft((current) => ({ ...current, tag: item.value }))}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex min-h-9 min-w-0 shrink-0 items-stretch gap-2">
            <div className="w-56 min-w-0">
              <ChipSelect
                options={CIVITAI_TYPES}
                value={filterDraft.types}
                onChange={(value) => setFilterDraft((current) => ({ ...current, types: value }))}
                placeholder="Model types"
                chipLabel={(value) => TYPE_LABELS[value] || value}
              />
            </div>
            <div className="w-56 min-w-0">
              <ChipSelect
                options={baseModelOptions}
                value={filterDraft.baseModels}
                onChange={(value) => setFilterDraft((current) => ({ ...current, baseModels: value }))}
                placeholder="Base model"
              />
            </div>
            <button
              type="button"
              className={[
                'inline-flex shrink-0 items-center gap-1 rounded border px-2.5 text-sm',
                filtersChanged ? 'border-accent bg-accent text-ink' : 'border-line bg-field text-muted',
              ].join(' ')}
              disabled={!filtersChanged}
              onClick={() => {
                setCivitaiBrowse(filterDraft)
                resetPage()
              }}
            >
              Apply filters
            </button>
          </div>
        </div>
      </div>
      ) : null}
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={tab.id === activeId ? 'flex min-h-0 min-w-0 flex-1 flex-col' : 'hidden'}
        >
          <CivitaiModelView
            modelId={tab.id}
            preferredBases={browse.baseModels}
            onDownload={(versionId) => setDownloadRequest({ modelId: tab.id, versionId })}
          />
        </div>
      ))}
      {activeId === null ? (
        <>
          {error ? (
            <CivitaiErrorState
              message={error}
              busy={busy}
              onRetry={() => {
                setError('')
                setBusy(true)
                setRetryCount((value) => value + 1)
              }}
            />
          ) : (
            <>
              {busy && !items.length ? <LoadingCircle label="Loading CivitAI models…" /> : null}
              {!busy && !items.length ? <p className="text-sm text-muted">No models found.</p> : null}
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">
                  {items.map((item) => (
                    <CivitaiTile
                      key={item.id}
                      item={item}
                      nsfw={browse.nsfw}
                      downloaded={sessionDownloadedIds.has(item.id) || isCivitaiModelDownloaded(item, localModels)}
                      downloading={downloadingIds.has(item.id)}
                      site={site}
                      preferredBases={browse.baseModels}
                      onOpen={() => openTab(item, true)}
                      onOpenBackground={() => openTab(item, false)}
                      onDownload={() => openDownload(item)}
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
          )}
        </>
      ) : null}
      {downloadRequest ? (
        <CivitaiDownloadDialog
          modelId={downloadRequest.modelId}
          preferredVersionId={downloadRequest.versionId}
          onClose={() => setDownloadRequest(null)}
          onDownloaded={() => void useModelsStore.getState().pull()}
          onDownloadStart={() =>
            setDownloadingIds((current) => {
              const next = new Set(current)
              next.add(downloadRequest.modelId)
              return next
            })
          }
          onDownloadFinished={(success) => {
            const modelId = downloadRequest.modelId
            setDownloadingIds((current) => {
              const next = new Set(current)
              next.delete(modelId)
              return next
            })
            if (success) {
              setSessionDownloadedIds((current) => {
                const next = new Set(current)
                next.add(modelId)
                return next
              })
            }
          }}
        />
      ) : null}
    </div>
  )
}
