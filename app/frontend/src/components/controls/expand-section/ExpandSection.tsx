import { type ReactNode, useEffect, useRef, useState } from 'react'
import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { CheckboxControl } from '@/components/controls/toggle/CheckboxControl.tsx'
import { ResizeGrip } from '@/components/controls/resizable-panel/ResizeGrip.tsx'

function remPx() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

type ExpandSectionProps = {
  title: string
  children: ReactNode
  enabled?: boolean
  onEnabled?: (value: boolean) => void
  fit?: boolean
  trailing?: ReactNode
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  locked?: boolean
  tone?: 'field' | 'inset'
}

export function ExpandSection({
  title,
  children,
  enabled = true,
  onEnabled,
  fit = false,
  trailing,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  locked = false,
  tone = 'field',
}: ExpandSectionProps) {
  const togglable = onEnabled != null
  const [uncontrolled, setUncontrolled] = useState(() => defaultOpen || (togglable && enabled))
  const controlled = openProp != null
  const open = controlled ? openProp : uncontrolled
  const [height, setHeight] = useState<number | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const dimmed = togglable && !enabled
  const inert = dimmed || locked
  const rem = remPx()
  const minH = 4 * rem
  const maxH = 48 * rem
  const defaultH = 16 * rem

  useEffect(() => {
    if (togglable && !controlled) {
      setUncontrolled(Boolean(enabled))
    }
  }, [controlled, enabled, togglable])

  function setOpen(next: boolean) {
    if (!controlled) {
      setUncontrolled(next)
    }
    onOpenChange?.(next)
  }

  function toggle() {
    setOpen(!open)
  }

  return (
    <div
      className={[
        'rounded border border-line',
        tone === 'inset' ? 'bg-panel' : 'bg-field',
        locked ? 'pointer-events-auto' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        {togglable ? (
          <CheckboxControl checked={enabled} onChange={(value) => onEnabled?.(value)} disabled={locked} />
        ) : null}
        <button
          type="button"
          className={[
            'flex min-w-0 flex-1 items-center text-sm',
            dimmed ? 'text-muted' : 'text-ink',
          ].join(' ')}
          onClick={toggle}
        >
          <span>{title}</span>
        </button>
        {trailing}
        <button
          type="button"
          className="flex items-center text-muted"
          aria-label={open ? 'Collapse' : 'Expand'}
          onClick={toggle}
        >
          <AppIcon id={open ? 'chevron-up' : 'chevron-down'} size={12} />
        </button>
      </div>
      {open ? (
        <div className={['relative border-t border-line', tone === 'inset' ? 'bg-bg' : ''].join(' ')}>
          <div
            ref={bodyRef}
            className={[
              'section-body p-2',
              fit ? '' : 'overflow-auto pb-5',
              dimmed ? 'opacity-40' : '',
              inert ? 'pointer-events-none' : '',
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
