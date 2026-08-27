import { NumberField } from '@/components/controls/number/NumberField.tsx'
import { SelectField } from '@/components/controls/select/SelectField.tsx'
import { SliderField } from '@/components/controls/slider/SliderField.tsx'
import { SettingsBlock, SettingsCard } from '@/views/settings/panels/content/SettingsBlock.tsx'
import {
  ANIMATED_THUMB_FORMATS,
  IMAGE_FORMATS,
  useSettingsStore,
  type AnimatedThumbFormat,
  type ImageFormat,
} from '@/stores/settingsStore.ts'

export const GALLERY_TAB_QUERY =
  'gallery tab search grid images load page size infinite scroll thumbnails megapixels jpg jpeg png webp gif video quality format'

export function GallerySection({ query = '' }: { query?: string }) {
  const galleryItemThumbMegapixels = useSettingsStore((s) => s.galleryItemThumbMegapixels)
  const galleryItemThumbFormat = useSettingsStore((s) => s.galleryItemThumbFormat)
  const galleryItemThumbVideoFormat = useSettingsStore((s) => s.galleryItemThumbVideoFormat)
  const galleryItemThumbQuality = useSettingsStore((s) => s.galleryItemThumbQuality)
  const galleryPageSize = useSettingsStore((s) => s.galleryPageSize)
  const setGalleryItemThumbMegapixels = useSettingsStore((s) => s.setGalleryItemThumbMegapixels)
  const setGalleryItemThumbFormat = useSettingsStore((s) => s.setGalleryItemThumbFormat)
  const setGalleryItemThumbVideoFormat = useSettingsStore((s) => s.setGalleryItemThumbVideoFormat)
  const setGalleryItemThumbQuality = useSettingsStore((s) => s.setGalleryItemThumbQuality)
  const setGalleryPageSize = useSettingsStore((s) => s.setGalleryPageSize)
  const qualityOff = galleryItemThumbFormat === 'png' && galleryItemThumbVideoFormat === 'gif'

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <SettingsCard query={query} title="Loading" terms="load page size infinite scroll search images count" setting="galleryPageSize">
        <NumberField value={galleryPageSize} onChange={setGalleryPageSize} min={20} max={500} />
        <p className="text-xs text-muted">Images fetched each time the Gallery search grid loads or scrolls for more.</p>
      </SettingsCard>
      <SettingsCard
        query={query}
        title="Thumbnails"
        terms="gallery thumbnails megapixels size cache jpg jpeg png webp gif video quality format"
      >
        <SettingsBlock query={query} title="Thumbnail megapixels" terms="megapixels size cap resize" setting="galleryItemThumbMegapixels">
          <SliderField
            value={galleryItemThumbMegapixels}
            onChange={setGalleryItemThumbMegapixels}
            min={0.05}
            max={2}
            step={0.05}
          />
          <p className="text-xs text-muted">
            Gallery tab previews are downscaled to this area. Image and video thumbs share this cap. Larger sources are
            never upscaled. Does not change model thumbnails.
          </p>
        </SettingsBlock>
        <SettingsBlock query={query} title="Image format" terms="png jpg jpeg webp still photo" setting="galleryItemThumbFormat">
          <SelectField
            value={galleryItemThumbFormat}
            onChange={(value) => setGalleryItemThumbFormat(value as ImageFormat)}
            options={[...IMAGE_FORMATS]}
          />
        </SettingsBlock>
        <SettingsBlock query={query} title="Video format" terms="gif webp video animated" setting="galleryItemThumbVideoFormat">
          <SelectField
            value={galleryItemThumbVideoFormat}
            onChange={(value) => setGalleryItemThumbVideoFormat(value as AnimatedThumbFormat)}
            options={[...ANIMATED_THUMB_FORMATS]}
          />
          <p className="text-xs text-muted">
            Stills use the image format. GIF, animated WebP, and video previews use the video format.
          </p>
        </SettingsBlock>
        <SettingsBlock query={query} title="Thumbnail quality" terms="jpeg webp jpg quality" setting="galleryItemThumbQuality">
          <div className={qualityOff ? 'pointer-events-none opacity-40' : ''}>
            <SliderField value={galleryItemThumbQuality} onChange={setGalleryItemThumbQuality} min={1} max={100} />
          </div>
          <p className="text-xs text-muted">Used for JPEG and WebP.</p>
        </SettingsBlock>
      </SettingsCard>
    </div>
  )
}
