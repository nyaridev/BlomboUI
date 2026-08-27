import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'

export function CivitaiLoadingCircle({ label }: { label: string }) {
  return (
    <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-muted" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-ink" />
      <span>{label}</span>
    </div>
  )
}

export function CivitaiErrorState({
  message,
  onRetry,
  busy = false,
}: {
  message: string
  onRetry: () => void
  busy?: boolean
}) {
  return (
    <div className="flex min-h-32 flex-1 items-center justify-center p-4">
      <div
        className="flex max-w-xl flex-col items-center gap-3 rounded-md border border-red/50 bg-panel p-5 text-center"
        role="alert"
      >
        <p className="text-sm text-red-bright">{message}</p>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded border border-line bg-field px-3 py-1.5 text-sm text-ink hover:bg-line disabled:cursor-not-allowed disabled:opacity-50"
          disabled={busy}
          onClick={onRetry}
        >
          <AppIcon id="refresh-cw" size={14} />
          {busy ? 'Retrying…' : 'Retry'}
        </button>
      </div>
    </div>
  )
}
