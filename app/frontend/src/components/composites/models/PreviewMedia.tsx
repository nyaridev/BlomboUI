import { isVideoPreview } from '@/lib/civitai/media.ts'
import { useEffect, useRef } from 'react'

export function PreviewMedia({
  src,
  type,
  alt = '',
  className = '',
  autoPlay = true,
  draggable = false,
  preload = 'metadata',
  onLoad,
  onError,
}: {
  src: string
  type?: string
  alt?: string
  className?: string
  autoPlay?: boolean
  draggable?: boolean
  preload?: 'none' | 'metadata' | 'auto'
  onLoad?: () => void
  onError?: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el) {
      return
    }
    if (autoPlay) {
      void el.play().catch(() => {})
    } else {
      el.pause()
    }
  }, [autoPlay, src])

  if (isVideoPreview(src, type)) {
    return (
      <video
        ref={videoRef}
        src={src}
        className={className}
        autoPlay={autoPlay}
        loop
        muted
        playsInline
        preload={preload}
        draggable={draggable}
        onLoadedData={onLoad}
        onError={onError}
      />
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      decoding="async"
      draggable={draggable}
      onLoad={onLoad}
      onError={onError}
    />
  )
}
