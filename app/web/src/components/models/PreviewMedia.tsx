import { isVideoPreview } from '@/lib/civitai/media.ts'

export function PreviewMedia({
  src,
  type,
  alt = '',
  className = '',
  autoPlay = true,
  draggable = false,
  onLoad,
  onError,
}: {
  src: string
  type?: string
  alt?: string
  className?: string
  autoPlay?: boolean
  draggable?: boolean
  onLoad?: () => void
  onError?: () => void
}) {
  if (isVideoPreview(src, type)) {
    return (
      <video
        src={src}
        className={className}
        autoPlay={autoPlay}
        loop
        muted
        playsInline
        preload="metadata"
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
