import { useEffect, useState } from 'react'
import { useVisible } from '@/lib/visible.ts'

export const TILE_GRAD = 'bg-gradient-to-tr from-field via-line to-muted/45'
export const TILE_PATTERN =
  'bg-[linear-gradient(45deg,rgb(255_255_255_/_0.08)_25%,transparent_25%_75%,rgb(255_255_255_/_0.08)_75%),linear-gradient(45deg,rgb(255_255_255_/_0.08)_25%,transparent_25%_75%,rgb(255_255_255_/_0.08)_75%)] bg-size-[18px_18px] bg-position-[0_0,9px_9px]'

export function TilePreview({
  src,
  mark = '?',
  markClass = 'text-2xl',
  markAlign = 'center',
  label,
  badge,
  warn = false,
  eager = false,
  className = '',
}: {
  src?: string | null
  mark?: string
  markClass?: string
  markAlign?: 'center' | 'start'
  label?: string
  badge?: string
  warn?: boolean
  eager?: boolean
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  const [ref, visible] = useVisible<HTMLSpanElement>()

  useEffect(() => {
    setBroken(false)
  }, [src])

  const showImg = Boolean(src) && !broken

  return (
    <span
      ref={ref}
      className={[
        'relative flex aspect-[2/3] items-center overflow-hidden rounded text-muted',
        markAlign === 'start' ? 'justify-start pl-px' : 'justify-center',
        markClass,
        TILE_GRAD,
        className,
      ].join(' ')}
    >
      {showImg && (eager || visible) ? (
        <img
          src={src || ''}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
        />
      ) : (
        <>
          <span aria-hidden="true" className={['pointer-events-none absolute inset-0', TILE_PATTERN].join(' ')} />
          <span className={['relative z-10', markAlign === 'start' ? '-ml-0.5' : ''].join(' ')}>{mark}</span>
        </>
      )}
      {warn ? <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-red/40" /> : null}
      {label ? (
        <span className="absolute bottom-1.5 left-1.5 z-10 max-w-[calc(100%-0.75rem)] truncate rounded bg-bg/70 px-1.5 py-0.5 text-left text-[11px] text-ink">
          {label}
        </span>
      ) : null}
      {badge ? (
        <span className="absolute top-1.5 left-1.5 z-10 max-w-[calc(100%-0.75rem)] truncate rounded bg-bg/70 px-1.5 py-0.5 text-left text-[11px] tabular-nums text-ink">
          {badge}
        </span>
      ) : null}
    </span>
  )
}
