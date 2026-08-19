import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

type DialogProps = {
  onClose: () => void
  children: ReactNode
  className?: string
}

export function Dialog({ onClose, children, className = 'w-[min(92vw,22rem)]' }: DialogProps) {
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-bg/80 p-4"
      data-overlay
      onClick={onClose}
    >
      <div
        className={['rounded-md border border-line bg-panel p-3', className].join(' ')}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

type Action = {
  label: string
  onClick: () => void
  kind?: 'primary' | 'ghost'
}

export function ConfirmDialog({
  title,
  body,
  actions,
  onClose,
}: {
  title: string
  body: string
  actions: Action[]
  onClose: () => void
}) {
  return (
    <Dialog onClose={onClose}>
      <p className="text-sm text-ink">{title}</p>
      <p className="mt-1.5 text-xs text-muted">{body}</p>
      <div className="mt-3 flex justify-end gap-2">
        {actions.map((item) => (
          <button
            key={item.label}
            type="button"
            className={
              item.kind === 'primary'
                ? 'rounded bg-accent px-2.5 py-1 text-xs text-ink'
                : 'rounded px-2.5 py-1 text-xs text-muted hover:bg-line hover:text-ink'
            }
            onClick={item.onClick}
          >
            {item.label}
          </button>
        ))}
      </div>
    </Dialog>
  )
}
