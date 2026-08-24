import { listCivitaiModels, type CivitaiModel } from '@/lib/api.ts'
import type { CivitaiBrowse, CivitaiTriState } from '@/lib/civitai/browse.ts'
import { dropCivitaiPage, loadCivitaiPage } from '@/lib/civitai/pageCache.ts'
import { pickVersionId } from '@/lib/civitai/version.ts'
import { filterTypeSections, MODEL_TYPE_SECTIONS } from '@/lib/modelTypes.ts'
import { CivitaiModelView } from './CivitaiModelView.tsx'
import { CivitaiDownloadDialog } from './CivitaiDownloadDialog.tsx'
import { CivitaiNavBar } from './CivitaiNavBar.tsx'
import { CivitaiFilters, filterDraftEqual, filterDraftOf, type CivitaiFilterDraft } from './CivitaiFilters.tsx'
import { CivitaiResults } from './CivitaiResults.tsx'
import { useModelsStore } from '@/stores/modelsStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { Link } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'

const CIVITAI_RETRY_DELAY = 2000

function triStateValue(value: CivitaiTriState): boolean | undefined {
  return value === 'off' ? undefined : value === 'include'
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
            resetPage()
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
            onDownload={(versionId) => setDownloadRequest({ modelId: tab.id, versionId })}
          />
        </div>
      ))}
      {activeId === null ? (
        <CivitaiResults
          error={error}
          busy={busy}
          items={items}
          page={page}
          hasNext={hasNext}
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
          onOpen={(item) => openTab(item, true)}
          onOpenBackground={(item) => openTab(item, false)}
          onDownload={openDownload}
          onPrevious={() => {
            if (cursorHistory.length) {
              const previous = cursorHistory[cursorHistory.length - 1] || undefined
              setCursorHistory((current) => current.slice(0, -1))
              setCursor(previous)
            }
            setPage((current) => Math.max(1, current - 1))
          }}
          onNext={() => {
            setCursorHistory((current) => [...current, cursor || ''])
            setCursor(nextCursor)
            setPage((current) => current + 1)
          }}
        />
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
