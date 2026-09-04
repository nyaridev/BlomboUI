import { CivitaiErrorState, CivitaiLoadingCircle } from '@/views/models/panels/civitai/sections/CivitaiErrorState.tsx'
import { CivitaiTile } from '@/views/models/panels/civitai/sections/CivitaiTile.tsx'
import type { CivitaiModel } from '@/lib/api.ts'
import { isCivitaiModelDownloaded } from '@/lib/civitai/downloaded.ts'
import type { ModelEntry } from '@/lib/api.ts'
import type { CivitaiSite } from '@/stores/settingsStore.ts'
import { useCallback, useEffect, useRef, useState } from 'react'

function CivitaiPlaceholder({
  sentinel,
  loading = false,
}: {
  sentinel?: (node: HTMLDivElement | null) => void
  loading?: boolean
}) {
  return (
    <div
      ref={sentinel}
      className="relative aspect-[2/3] min-w-0 overflow-hidden rounded-md border border-line bg-bg"
      aria-hidden={!loading}
    >
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center" role="status" aria-label="Loading more models">
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-muted border-t-ink" />
        </div>
      ) : null}
    </div>
  )
}

export function CivitaiResults({
  active,
  error,
  busy,
  items,
  hasNext,
  loadingMore,
  loadMoreError,
  placeholderCount,
  scrollNonce,
  nsfw,
  localModels,
  sessionDownloadedIds,
  downloadingIds,
  site,
  preferredBases,
  onRetry,
  onLoadMore,
  onOpen,
  onOpenBackground,
  onDownload,
}: {
  active: boolean
  error: string
  busy: boolean
  items: CivitaiModel[]
  hasNext: boolean
  loadingMore: boolean
  loadMoreError: string
  placeholderCount: number
  scrollNonce: number
  nsfw: boolean
  localModels: ModelEntry[]
  sessionDownloadedIds: Set<number>
  downloadingIds: Set<number>
  site: CivitaiSite
  preferredBases: string[]
  onRetry: () => void
  onLoadMore: () => void
  onOpen: (item: CivitaiModel) => void
  onOpenBackground: (item: CivitaiModel) => void
  onDownload: (item: CivitaiModel) => void
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null)
  const setSentinelRef = useCallback((node: HTMLDivElement | null) => setSentinel(node), [])

  useEffect(() => {
    scrollerRef.current?.scrollTo(0, 0)
  }, [scrollNonce])

  useEffect(() => {
    const root = scrollerRef.current
    if (!active || !root || !sentinel || !hasNext || loadingMore || loadMoreError) {
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          onLoadMore()
        }
      },
      { root, rootMargin: '200px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [active, hasNext, loadMoreError, loadingMore, onLoadMore, sentinel])

  if (error) {
    return <CivitaiErrorState message={error} busy={busy} onRetry={onRetry} />
  }
  return (
    <>
      {busy && !items.length ? <CivitaiLoadingCircle label="Loading CivitAI models…" /> : null}
      {!busy && !items.length ? <p className="text-sm text-muted">No models found.</p> : null}
      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">
          {items.map((item) => (
            <CivitaiTile
              key={item.id}
              item={item}
              nsfw={nsfw}
              downloaded={sessionDownloadedIds.has(item.id) || isCivitaiModelDownloaded(item, localModels)}
              downloading={downloadingIds.has(item.id)}
              site={site}
              preferredBases={preferredBases}
              onOpen={() => onOpen(item)}
              onOpenBackground={() => onOpenBackground(item)}
              onDownload={() => onDownload(item)}
            />
          ))}
          {hasNext
            ? Array.from({ length: placeholderCount }, (_, index) => (
                <CivitaiPlaceholder
                  key={`ph-${index}`}
                  sentinel={index === 0 ? setSentinelRef : undefined}
                  loading={loadingMore && index === 0}
                />
              ))
            : null}
        </div>
        {loadMoreError ? (
          <div className="flex flex-col items-center gap-2 py-4">
            <p className="text-xs text-red-bright">{loadMoreError}</p>
            <button
              type="button"
              className="rounded border border-line bg-field px-2 py-1 text-xs text-ink hover:bg-line"
              onClick={onLoadMore}
            >
              Retry
            </button>
          </div>
        ) : null}
      </div>
    </>
  )
}
