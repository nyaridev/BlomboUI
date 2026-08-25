import { useCallback, useEffect, useState } from 'react'
import { useVisible } from '@/lib/gallery/visible.ts'
import { RAW_TILE_MIN_PX } from '@/lib/gallery/thumbView.ts'

export const TILE_GRAD = 'bg-gradient-to-tr from-field via-line to-muted/45'
export const TILE_PATTERN =
  'bg-[linear-gradient(45deg,rgb(255_255_255_/_0.08)_25%,transparent_25%_75%,rgb(255_255_255_/_0.08)_75%),linear-gradient(45deg,rgb(255_255_255_/_0.08)_25%,transparent_25%_75%,rgb(255_255_255_/_0.08)_75%)] bg-size-[18px_18px] bg-position-[0_0,9px_9px]'
export const TILE_GLOW = 'shadow-[0_0_10px_rgb(255_255_255_/_0.45)]'
export const TILE_GLOW_IN = 'shadow-[inset_0_0_14px_2px_rgb(255_255_255_/_0.75)]'
export const TILE_ON = `ring-2 ring-inset ring-white ${TILE_GLOW_IN}`

export function TilePreview({
  src,
  rawSrc,
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
  rawSrc?: string | null
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
  const [visibleRef, visible] = useVisible<HTMLSpanElement>()
  const [node, setNode] = useState<HTMLSpanElement | null>(null)
  const [useRaw, setUseRaw] = useState(false)
  const ref = useCallback(
    (el: HTMLSpanElement | null) => {
      visibleRef(el)
      setNode(el)
    },
    [visibleRef],
  )

  useEffect(() => {
    setBroken(false)
  }, [media, src, rawSrc])

  useEffect(() => {
    if (!node || !rawSrc) {
      setUseRaw(false)
      return
    }
    const update = () => {
      setUseRaw(Math.max(node.clientWidth, node.clientHeight) >= RAW_TILE_MIN_PX)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [node, rawSrc])

  const shown = useRaw && rawSrc ? rawSrc : src
  const showMedia = Boolean(shown) && !broken
  const mediaType = media || mediaFromUrl(shown)
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
            src={shown || ''}
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
            src={shown || ''}
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
