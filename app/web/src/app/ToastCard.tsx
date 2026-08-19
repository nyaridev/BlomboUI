import { CloseIcon } from '@/components/CloseIcon.tsx'
import { type ToastTone } from '@/stores/toastStore.ts'

const TONE: Record<ToastTone, { bar: string; edge: string }> = {
  ok: { bar: 'bg-emerald-600', edge: '#059669' },
  info: { bar: 'bg-sky-600', edge: '#0284c7' },
  error: { bar: 'bg-[#c24f5c]', edge: '#c24f5c' },
}

export function ToastCard({
  text,
  tone,
  onClose,
  className = '',
}: {
  text: string
  tone: ToastTone
  onClose?: () => void
  className?: string
}) {
  const c = TONE[tone]
  return (
    <div
      className={['rounded-md p-px', className].join(' ')}
      style={{ background: `linear-gradient(to left, ${c.edge}, var(--color-line) 55%)` }}
    >
      <div className="flex gap-1 rounded-[5px] bg-panel p-1">
        <div className={['w-1.5 shrink-0 rounded-sm', c.bar].join(' ')} />
        <div className="flex min-w-0 flex-1 items-start gap-2 px-3 py-2 text-sm text-ink">
          <p className="min-w-0 flex-1">{text}</p>
          {onClose ? (
            <button
              type="button"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-line hover:text-ink"
              aria-label="Dismiss"
              onClick={onClose}
            >
              <CloseIcon />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
