import { MediaCarousel } from '@/components/composites/models/MediaCarousel.tsx'
import type { CivitaiModelImage } from '@/lib/api.ts'

export function CivitaiPreviewStrip({
  images,
  alt,
  showNsfw,
}: {
  images: CivitaiModelImage[]
  alt: string
  showNsfw: boolean
}) {
  return <MediaCarousel items={images} alt={alt} showNsfw={showNsfw} />
}
