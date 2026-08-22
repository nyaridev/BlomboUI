import { useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type DialogProps = {
  onClose: () => void
  children: ReactNode
  className?: string
}

export function Dialog({ onClose, children, className = 'w-[min(92vw,22rem)]' }: DialogProps) {
  const downTarget = useRef<EventTarget | null>(null)

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-bg/80 p-4"
      data-overlay
      onMouseDown={(event) => {
        downTarget.current = event.target
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget || downTarget.current !== event.currentTarget) {
          return
        }
        onClose()
      }}
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
  danger?: boolean
}

export function ConfirmDialog({
  title,
  body,
  actions,
  onClose,
  phrase,
}: {
  title: string
  body: string
  actions: Action[]
  onClose: () => void
  phrase?: string
}) {
  const [typed, setTyped] = useState('')
  const unlocked = !phrase || typed === phrase
  return (
    <Dialog onClose={onClose}>
      <p className="text-sm text-ink">{title}</p>
      <p className="mt-1.5 text-xs text-muted">{body}</p>
      {phrase ? (
        <input
          className="mt-2 w-full rounded border border-line bg-field px-2 py-1.5 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder={phrase}
          autoFocus
        />
      ) : null}
      <div className="mt-3 flex justify-end gap-2">
        {actions.map((item) => {
          const locked = item.kind === 'primary' && !unlocked
          return (
            <button
              key={item.label}
              type="button"
              disabled={locked}
              className={
                item.kind === 'primary'
                  ? [
                      'rounded px-2.5 py-1 text-xs text-ink disabled:opacity-40',
                      item.danger ? 'bg-red' : 'bg-accent',
                    ].join(' ')
                  : item.danger
                    ? 'rounded px-2.5 py-1 text-xs text-red-bright hover:bg-red/15'
                    : 'rounded px-2.5 py-1 text-xs text-muted hover:bg-line hover:text-ink'
              }
              onClick={item.onClick}
            >
              {item.label}
            </button>
          )
        })}
      </div>
    </Dialog>
  )
}
