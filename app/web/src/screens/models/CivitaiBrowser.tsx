import { listCivitaiModels, type CivitaiModel } from '@/lib/api.ts'
import type { CivitaiBrowse, CivitaiTriState } from '@/lib/civitai/browse.ts'
import { markNamesFromModels } from '@/lib/civitai/marks.ts'
import { dropCivitaiPage, loadCivitaiPage } from '@/lib/civitai/pageCache.ts'
import { openCivitaiModelTab } from '@/lib/civitai/openTab.ts'
import { pickVersionId } from '@/lib/civitai/version.ts'
import { filterTypeSections, MODEL_TYPE_SECTIONS } from '@/lib/modelTypes.ts'
import { CivitaiModelView } from './CivitaiModelView.tsx'
import { CivitaiDownloadDialog } from './CivitaiDownloadDialog.tsx'
import { CivitaiNavBar } from './CivitaiNavBar.tsx'
import { CivitaiFilters, filterDraftEqual, filterDraftOf, type CivitaiFilterDraft } from './CivitaiFilters.tsx'
import { CivitaiResults } from './CivitaiResults.tsx'
import { useModelsStore } from '@/stores/modelsStore.ts'
import { useDownloadsStore } from '@/stores/downloadsStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { Link } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const CIVITAI_RETRY_DELAY = 2000

function triStateValue(value: CivitaiTriState): boolean | undefined {
  return value === 'off' ? undefined : value === 'include'
}

function mergeModels(current: CivitaiModel[], incoming: CivitaiModel[]) {
  if (!incoming.length) {
    return current
  }
  const seen = new Set(current.map((item) => item.id))
  const extra = incoming.filter((item) => !seen.has(item.id))
  return extra.length ? [...current, ...extra] : current
}


function rememberMarks(items: CivitaiModel[]) {
  useSettingsStore.getState().rememberCivitaiMarks(markNamesFromModels(items))
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
  const diffusionModels = useModelsStore((state) => state.diffusion_models)
  const loras = useModelsStore((state) => state.loras)
  const vae = useModelsStore((state) => state.vae)
  const textEncoders = useModelsStore((state) => state.text_encoders)
  const controlnet = useModelsStore((state) => state.controlnet)
  const embeddings = useModelsStore((state) => state.embeddings)
  const wildcards = useModelsStore((state) => state.wildcards)
  const localModels = useMemo(
    () => [
      ...checkpoints,
      ...diffusionModels,
      ...loras,
      ...vae,
      ...textEncoders,
      ...controlnet,
      ...embeddings,
      ...wildcards,
    ],
    [checkpoints, controlnet, diffusionModels, embeddings, loras, textEncoders, vae, wildcards],
  )
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filterDraft, setFilterDraft] = useState<CivitaiFilterDraft>(() => filterDraftOf(browse))
  const [items, setItems] = useState<CivitaiModel[]>([])
  const [hasNext, setHasNext] = useState(false)
  const [busy, setBusy] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState('')
  const [error, setError] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const [autoRetrying, setAutoRetrying] = useState(false)
  const [retryAttempt, setRetryAttempt] = useState(0)
  const [retryMessage, setRetryMessage] = useState('')
  const [downloadRequest, setDownloadRequest] = useState<{ modelId: number; versionId?: number } | null>(null)
  const [downloadingIds, setDownloadingIds] = useState<Set<number>>(() => new Set())
  const [sessionDownloadedIds, setSessionDownloadedIds] = useState<Set<number>>(() => new Set())
  const [scrollNonce, setScrollNonce] = useState(0)
  const request = useRef(0)
  const retryTimer = useRef<number | null>(null)
  const retryAbort = useRef<AbortController | null>(null)
  const loadMoreAbort = useRef<AbortController | null>(null)
  const loadingMoreRef = useRef(false)
  const nextCursorRef = useRef<string | undefined>(undefined)
  const filtersRef = useRef<HTMLDivElement>(null)
  const baseModelOptions = filterTypeSections(
    MODEL_TYPE_SECTIONS,
    (item) => !hiddenModelTypes.includes(item) || browse.baseModels.includes(item),
  )

  function resetSearch() {
    setHasNext(false)
    nextCursorRef.current = undefined
  }

  function updateBrowse(patch: Partial<CivitaiBrowse>) {
    setCivitaiBrowse(patch)
    resetSearch()
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

  function openTab(item: CivitaiModel, focus: boolean) {
    openCivitaiModelTab(item, focus)
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
    setLoadingMore(false)
    setLoadMoreError('')
    loadingMoreRef.current = false
    loadMoreAbort.current?.abort()
    loadMoreAbort.current = null
    if (!apiKey.trim()) {
      setItems([])
      setHasNext(false)
      nextCursorRef.current = undefined
      setError('')
      setBusy(false)
      return
    }
    const id = ++request.current
    const abort = new AbortController()
    retryAbort.current = abort
    let stopped = false
    setItems([])
    setHasNext(false)
    nextCursorRef.current = undefined
    setScrollNonce((value) => value + 1)
    setBusy(true)
    setError('')

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
        limit: browse.limit,
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
          const cursor = result.nextCursor || undefined
          setItems(result.items)
          rememberMarks(result.items)
          setHasNext(Boolean(cursor))
          nextCursorRef.current = cursor
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
          nextCursorRef.current = undefined
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
    browse.baseModels.join('\n'),
    browse.earlyAccess,
    browse.fromPlatform,
    browse.limit,
    browse.period,
    browse.query,
    browse.sort,
    browse.supportsGeneration,
    browse.tag,
    browse.types.join('\n'),
    loaded,
    retryCount,
  ])

  const loadMore = useCallback(() => {
    const cursor = nextCursorRef.current
    if (!cursor || loadingMoreRef.current || !apiKey.trim()) {
      return
    }
    const id = request.current
    loadingMoreRef.current = true
    setLoadingMore(true)
    setLoadMoreError('')
    const abort = new AbortController()
    loadMoreAbort.current?.abort()
    loadMoreAbort.current = abort
    const store = useSettingsStore.getState().civitaiBrowse
    void listCivitaiModels({
      query: store.query,
      types: store.types,
      baseModels: store.baseModels,
      sort: store.sort,
      period: store.period,
      limit: store.limit,
      cursor,
      earlyAccess: triStateValue(store.earlyAccess),
      supportsGeneration: triStateValue(store.supportsGeneration),
      fromPlatform: triStateValue(store.fromPlatform),
      nsfw: true,
      tag: store.tag,
      signal: abort.signal,
    })
      .then((result) => {
        if (id !== request.current) {
          return
        }
        const next = result.nextCursor || undefined
        setItems((current) => mergeModels(current, result.items))
        rememberMarks(result.items)
        setHasNext(Boolean(next))
        nextCursorRef.current = next
        setLoadMoreError('')
      })
      .catch((err) => {
        if (id !== request.current || abort.signal.aborted) {
          return
        }
        setLoadMoreError(err instanceof Error ? err.message : 'Could not load more CivitAI models')
      })
      .finally(() => {
        if (loadMoreAbort.current === abort) {
          loadMoreAbort.current = null
        }
        if (id === request.current) {
          loadingMoreRef.current = false
          setLoadingMore(false)
        }
      })
  }, [apiKey])

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
          <Link to="/settings#civitai" className="text-purple-bright underline decoration-purple-bright/50 hover:decoration-purple-bright">
            Settings → Civitai → Account
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
        <CivitaiFilters
          browse={browse}
          filterDraft={filterDraft}
          setFilterDraft={setFilterDraft}
          baseModelOptions={baseModelOptions}
          filtersOpen={filtersOpen}
          filtersRef={filtersRef}
          activeFilterCount={activeFilterCount}
          filtersChanged={filtersChanged}
          onUpdateBrowse={updateBrowse}
          onToggle={() => setFiltersOpen((open) => !open)}
          onApply={() => {
            setCivitaiBrowse(filterDraft)
            resetSearch()
          }}
          onNsfw={() => setCivitaiBrowse({ nsfw: !browse.nsfw })}
        />
      ) : null}
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={tab.id === activeId ? 'flex min-h-0 min-w-0 flex-1 flex-col' : 'hidden'}
        >
          <CivitaiModelView
            modelId={tab.id}
            preferredBases={browse.baseModels}
            active={tab.id === activeId}
            onDownload={(versionId) => setDownloadRequest({ modelId: tab.id, versionId })}
          />
        </div>
      ))}
      {activeId === null ? (
        <CivitaiResults
          error={error}
          busy={busy}
          items={items}
          hasNext={hasNext}
          loadingMore={loadingMore}
          loadMoreError={loadMoreError}
          placeholderCount={browse.limit}
          scrollNonce={scrollNonce}
          nsfw={browse.nsfw}
          localModels={localModels}
          sessionDownloadedIds={sessionDownloadedIds}
          downloadingIds={downloadingIds}
          site={site}
          preferredBases={browse.baseModels}
          onRetry={() => {
            setError('')
            setBusy(true)
            setRetryCount((value) => value + 1)
          }}
          onLoadMore={loadMore}
          onOpen={(item) => openTab(item, true)}
          onOpenBackground={(item) => openTab(item, false)}
          onDownload={openDownload}
        />
      ) : null}
      {downloadRequest ? (
        <CivitaiDownloadDialog
          modelId={downloadRequest.modelId}
          preferredVersionId={downloadRequest.versionId}
          onClose={() => setDownloadRequest(null)}
          onDownloaded={() => {
            void useModelsStore.getState().pull()
            void useDownloadsStore.getState().load()
          }}
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
