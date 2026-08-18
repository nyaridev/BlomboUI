import { type ReactNode, useState } from 'react'
import { Chevron } from '@/components/Chevron.tsx'

type ExpandSectionProps = {
  title: string
  children: ReactNode
  enabled?: boolean
  onEnabled?: (value: boolean) => void
}

export function ExpandSection({ title, children, enabled = true, onEnabled }: ExpandSectionProps) {
  const [open, setOpen] = useState(false)
  const togglable = onEnabled != null
  const dimmed = togglable && !enabled

  return (
    <div className="rounded border border-line bg-field">
      <div className="flex items-center gap-2 px-2 py-1.5">
        {togglable ? (
          <input
            type="checkbox"
            className="check"
            checked={enabled}
            onChange={(e) => onEnabled(e.target.checked)}
          />
        ) : null}
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center justify-between text-sm text-ink"
          onClick={() => setOpen((value) => !value)}
        >
          <span>{title}</span>
          <span className="text-muted">
            <Chevron dir={open ? 'up' : 'down'} />
          </span>
        </button>
      </div>
      {open ? (
        <div
          className={`section-body border-t border-line p-2 ${dimmed ? 'pointer-events-none opacity-40' : ''}`}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}
