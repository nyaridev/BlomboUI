import { useEffect, useState } from 'react'
import { useVisible } from '@/lib/gallery/visible.ts'

export const TILE_GRAD = 'bg-gradient-to-tr from-field via-line to-muted/45'
export const TILE_PATTERN =
  'bg-[linear-gradient(45deg,rgb(255_255_255_/_0.08)_25%,transparent_25%_75%,rgb(255_255_255_/_0.08)_75%),linear-gradient(45deg,rgb(255_255_255_/_0.08)_25%,transparent_25%_75%,rgb(255_255_255_/_0.08)_75%)] bg-size-[18px_18px] bg-position-[0_0,9px_9px]'
export const TILE_GLOW = 'shadow-[0_0_10px_rgb(255_255_255_/_0.45)]'
export const TILE_GLOW_IN = 'shadow-[inset_0_0_14px_2px_rgb(255_255_255_/_0.75)]'
export const TILE_ON = `ring-2 ring-inset ring-white ${TILE_GLOW_IN}`

export function TilePreview({
  src,
  mark = '?',
  markClass = 'text-2xl',
  markAlign = 'center',
  label,
  badge,
  warn = false,
  eager = false,
  glow = false,
  selected = false,
  media = '',
  preventMediaDrag = false,
  onLoad,
  onError,
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
  glow?: boolean
  selected?: boolean
  media?: string
  preventMediaDrag?: boolean
  onLoad?: () => void
  onError?: () => void
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  const [ref, visible] = useVisible<HTMLSpanElement>()

  useEffect(() => {
    setBroken(false)
  }, [media, src])

  const showMedia = Boolean(src) && !broken
  const mediaType = media || mediaFromUrl(src)
  const isVideo = mediaType.toLowerCase().startsWith('video/')

  return (
    <span
      ref={ref}
      className={[
        'relative block aspect-[2/3] overflow-hidden rounded text-muted',
        markClass,
        TILE_GRAD,
        className,
      ].join(' ')}
    >
      {showMedia && (eager || visible) ? (
        isVideo ? (
          <video
            src={src || ''}
            className="absolute inset-0 h-full w-full max-h-none max-w-none object-cover"
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            draggable={preventMediaDrag ? false : undefined}
            onLoadedData={onLoad}
            onError={() => {
              setBroken(true)
              onError?.()
            }}
          />
        ) : (
          <img
            src={src || ''}
            alt=""
            className="absolute inset-0 h-full w-full max-h-none max-w-none object-cover"
            loading="lazy"
            decoding="async"
            draggable={preventMediaDrag ? false : undefined}
            onLoad={onLoad}
            onError={() => {
              setBroken(true)
              onError?.()
            }}
          />
        )
      ) : (
        <>
          <span aria-hidden="true" className={['pointer-events-none absolute inset-0', TILE_PATTERN].join(' ')} />
          <span
            className={[
              'absolute inset-0 z-10 flex items-center',
              markAlign === 'start' ? 'justify-start pl-px' : 'justify-center',
            ].join(' ')}
          >
            <span className={markAlign === 'start' ? '-ml-0.5' : ''}>{mark}</span>
          </span>
        </>
      )}
      {warn ? <span aria-hidden="true" className="prompt-invalid-overlay pointer-events-none absolute inset-0" /> : null}
      {selected || glow ? (
        <span
          aria-hidden="true"
          className={['pointer-events-none absolute inset-0 z-20 rounded', selected ? TILE_ON : TILE_GLOW_IN].join(' ')}
        />
      ) : null}
      {label ? (
        <span
          className={[
            'absolute bottom-1.5 left-1.5 z-10 max-w-[calc(100%-0.75rem)] truncate rounded bg-bg/70 px-1.5 py-0.5 text-left text-[11px]',
            warn ? 'text-red' : 'text-ink',
          ].join(' ')}
        >
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

function mediaFromUrl(src?: string | null) {
  if (!src) {
    return ''
  }
  try {
    const url = new URL(src, window.location.href)
    const declared = url.searchParams.get('media')
    if (declared) {
      return declared
    }
    return url.pathname.toLowerCase().endsWith('.mp4') ? 'video/mp4' : ''
  } catch {
    return ''
  }
}
