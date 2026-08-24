import { type ReactNode, useRef, useState } from 'react'
import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { ResizeGrip } from '@/components/chrome/ResizeGrip.tsx'

function remPx() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

type ExpandSectionProps = {
  title: string
  children: ReactNode
  enabled?: boolean
  onEnabled?: (value: boolean) => void
  fit?: boolean
}

export function ExpandSection({ title, children, enabled = true, onEnabled, fit = false }: ExpandSectionProps) {
  const [open, setOpen] = useState(false)
  const [height, setHeight] = useState<number | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const togglable = onEnabled != null
  const dimmed = togglable && !enabled
  const rem = remPx()
  const minH = 4 * rem
  const maxH = 48 * rem
  const defaultH = 16 * rem

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
            <AppIcon id={open ? 'chevron-up' : 'chevron-down'} size={12} />
          </span>
        </button>
      </div>
      {open ? (
        <div className="relative border-t border-line">
          <div
            ref={bodyRef}
            className={[
              'section-body p-2',
              fit ? '' : 'overflow-auto pb-5',
              dimmed ? 'pointer-events-none opacity-40' : '',
            ].join(' ')}
            style={fit ? undefined : height != null ? { height } : { maxHeight: defaultH }}
          >
            {children}
          </div>
          {fit ? null : (
            <ResizeGrip
              value={height ?? bodyRef.current?.offsetHeight ?? defaultH}
              onChange={setHeight}
              onReset={() => setHeight(null)}
              min={minH}
              max={maxH}
            />
          )}
        </div>
      ) : null}
    </div>
  )
}
