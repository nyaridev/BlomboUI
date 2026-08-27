import { ButtonControl } from '@/components/controls/button/ButtonControl.tsx'
import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'

export function ManagerErrorState({
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
      <div className="flex max-w-xl flex-col items-center gap-3 rounded-md border border-red/50 bg-panel p-5 text-center" role="alert">
        <p className="text-sm text-red-bright">{message}</p>
        <ButtonControl tone="ghost" size="sm" disabled={busy} onClick={onRetry}>
          <span className="inline-flex items-center gap-1.5">
            <AppIcon id="refresh-cw" size={14} />
            {busy ? 'Retrying…' : 'Retry'}
          </span>
        </ButtonControl>
      </div>
    </div>
  )
}
