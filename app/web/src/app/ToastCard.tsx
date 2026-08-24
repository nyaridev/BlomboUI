import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { type ToastTone } from '@/stores/toastStore.ts'

const TONE: Record<ToastTone, { bar: string; edge: string }> = {
  ok: { bar: 'bg-green', edge: 'var(--color-green)' },
  info: { bar: 'bg-blue', edge: 'var(--color-blue)' },
  error: { bar: 'bg-red', edge: 'var(--color-red)' },
}

export function ToastCard({
  text,
  tone,
  progress,
  onClose,
  onCancel,
  className = '',
}: {
  text: string
  tone: ToastTone
  progress?: number | null
  onClose?: () => void
  onCancel?: () => void
  className?: string
}) {
  const c = TONE[tone]
  const fill = Math.min(100, Math.max(0, progress ?? 0))
  return (
    <div
      className={['rounded-md p-px', className].join(' ')}
      style={{ background: `linear-gradient(to left, ${c.edge}, var(--color-line) 55%)` }}
    >
      <div className="flex gap-1 rounded-[5px] bg-panel p-1">
        <div className={['w-1.5 shrink-0 rounded-sm', c.bar].join(' ')} />
        <div className="flex min-w-0 flex-1 flex-col gap-2 px-3 py-2 text-sm text-ink">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1">{text}</p>
            {onCancel ? (
              <button
                type="button"
                className="shrink-0 rounded px-1.5 py-0.5 text-xs text-muted hover:bg-line hover:text-ink"
                onClick={onCancel}
              >
                Cancel
              </button>
            ) : onClose ? (
              <button
                type="button"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-line hover:text-ink"
                aria-label="Dismiss"
                onClick={onClose}
              >
                <AppIcon id="x" />
              </button>
            ) : null}
          </div>
          {progress != null ? (
            <div className="h-1.5 overflow-hidden rounded bg-field">
              <div className="h-full bg-accent" style={{ width: `${fill}%` }} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
