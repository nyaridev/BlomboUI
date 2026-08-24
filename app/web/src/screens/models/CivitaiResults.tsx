import { CivitaiErrorState } from './CivitaiErrorState.tsx'
import { CivitaiTile } from './CivitaiTile.tsx'
import type { CivitaiModel } from '@/lib/api.ts'
import { isCivitaiModelDownloaded } from '@/lib/civitai/downloaded.ts'
import type { ModelEntry } from '@/lib/api.ts'
import type { CivitaiSite } from '@/stores/settingsStore.ts'

function LoadingCircle({ label }: { label: string }) {
  return (
    <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-muted" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-ink" />
      <span>{label}</span>
    </div>
  )
}

export function CivitaiResults({
  error,
  busy,
  items,
  page,
  hasNext,
  nsfw,
  localModels,
  sessionDownloadedIds,
  downloadingIds,
  site,
  preferredBases,
  onRetry,
  onOpen,
  onOpenBackground,
  onDownload,
  onPrevious,
  onNext,
}: {
  error: string
  busy: boolean
  items: CivitaiModel[]
  page: number
  hasNext: boolean
  nsfw: boolean
  localModels: ModelEntry[]
  sessionDownloadedIds: Set<number>
  downloadingIds: Set<number>
  site: CivitaiSite
  preferredBases: string[]
  onRetry: () => void
  onOpen: (item: CivitaiModel) => void
  onOpenBackground: (item: CivitaiModel) => void
  onDownload: (item: CivitaiModel) => void
  onPrevious: () => void
  onNext: () => void
}) {
  if (error) {
    return <CivitaiErrorState message={error} busy={busy} onRetry={onRetry} />
  }
  return (
    <>
      {busy && !items.length ? <LoadingCircle label="Loading CivitAI models…" /> : null}
      {!busy && !items.length ? <p className="text-sm text-muted">No models found.</p> : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
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
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-center gap-2">
        <button
          type="button"
          className="rounded border border-line bg-field px-2 py-1 text-xs text-ink disabled:opacity-40"
          disabled={page <= 1 || busy}
          onClick={onPrevious}
        >
          Previous
        </button>
        <span className="text-xs tabular-nums text-muted">Page {page}</span>
        <button
          type="button"
          className="rounded border border-line bg-field px-2 py-1 text-xs text-ink disabled:opacity-40"
          disabled={!hasNext || busy}
          onClick={onNext}
        >
          Next
        </button>
      </div>
    </>
  )
}
