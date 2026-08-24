import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { Dialog } from './Dialog.tsx'

const INPUT =
  'mt-2 w-full rounded border bg-field px-2 py-1.5 text-sm text-ink outline-none placeholder:text-muted'
const GHOST =
  'rounded px-2.5 py-1 text-xs text-muted hover:bg-line hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted'
const PRIMARY = 'rounded bg-accent px-2.5 py-1 text-xs text-ink disabled:opacity-40'

export type NameDialogAction = {
  label: string
  kind?: 'ghost' | 'primary'
  disabled?: boolean
  submit?: boolean
  onClick: () => void
}

export function NameDialog({
  title,
  description,
  name,
  issue,
  busy,
  onName,
  onClose,
  actions,
  selectBeforeExtension = false,
  selectAllOnOpen = false,
}: {
  title: string
  description?: ReactNode
  name: string
  issue?: string | null
  busy?: boolean
  onName: (name: string) => void
  onClose: () => void
  actions: NameDialogAction[]
  selectBeforeExtension?: boolean
  selectAllOnOpen?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => {
    if ((!selectBeforeExtension && !selectAllOnOpen) || !input.current) {
      return
    }
    const element = input.current
    element.focus()
    const cut = element.value.lastIndexOf('.')
    if (selectBeforeExtension && cut > 0) {
      element.setSelectionRange(0, cut)
    } else {
      element.select()
    }
  }, [selectAllOnOpen, selectBeforeExtension])
  const submit = actions.find((action) => action.submit)
  const disabled = (action: NameDialogAction) => Boolean(busy || action.disabled)
  return (
    <Dialog onClose={onClose}>
      <p className="text-sm text-ink">{title}</p>
      {description}
      <input
        ref={input}
        className={[INPUT, issue ? 'border-red focus:border-red' : 'border-line focus:border-accent'].join(' ')}
        value={name}
        onChange={(event) => onName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && submit && !disabled(submit)) {
            event.preventDefault()
            submit.onClick()
          }
        }}
        placeholder="name"
        autoFocus={!selectBeforeExtension && !selectAllOnOpen}
      />
      {issue ? <p className="mt-1.5 text-xs text-red">{issue}</p> : null}
      <div className="mt-3 flex justify-end gap-2">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className={action.kind === 'primary' ? PRIMARY : GHOST}
            disabled={disabled(action)}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ))}
      </div>
    </Dialog>
  )
}
