import { PrimitiveDialog } from '@/components/primitives/PrimitiveDialog.tsx'
import { ButtonControl } from '@/components/controls/button/ButtonControl.tsx'
import { TextField } from '@/components/controls/input/TextField.tsx'
import { useState, type ReactNode } from 'react'

type DialogProps = {
  onClose: () => void
  children: ReactNode
  className?: string
}

export function Dialog({ onClose, children, className = 'w-[min(92vw,22rem)]' }: DialogProps) {
  return (
    <PrimitiveDialog
      onClose={onClose}
      overlayClassName="fixed inset-0 z-[60] bg-bg/80 p-4"
      contentClassName={['fixed top-1/2 left-1/2 z-[61] -translate-x-1/2 -translate-y-1/2 rounded-md border border-line bg-panel p-3', className].join(' ')}
    >
      {children}
    </PrimitiveDialog>
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
  body: ReactNode
  actions: Action[]
  onClose: () => void
  phrase?: string
}) {
  const [typed, setTyped] = useState('')
  const unlocked = !phrase || typed === phrase
  return (
    <Dialog onClose={onClose}>
      <p className="text-sm text-ink">{title}</p>
      {typeof body === 'string' ? <p className="mt-1.5 text-xs text-muted">{body}</p> : <div className="mt-1.5 text-xs text-muted">{body}</div>}
      {phrase ? (
        <TextField
          className="mt-2"
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
            <ButtonControl
              key={item.label}
              size="sm"
              tone={item.kind === 'primary' ? (item.danger ? 'danger' : 'accent') : item.danger ? 'danger' : 'ghost'}
              disabled={locked}
              onClick={item.onClick}
            >
              {item.label}
            </ButtonControl>
          )
        })}
      </div>
    </Dialog>
  )
}
