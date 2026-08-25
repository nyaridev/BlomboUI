import { SelectField } from '@/components/primitives/SelectField.tsx'
import { SliderField } from '@/components/primitives/SliderField.tsx'
import { SettingsBlock, SettingsCard } from './SettingsBlock.tsx'
import {
  ANIMATED_THUMB_FORMATS,
  IMAGE_FORMATS,
  useSettingsStore,
  type AnimatedThumbFormat,
  type ImageFormat,
} from '@/stores/settingsStore.ts'

export const HISTORY_QUERY =
  'download history thumbnails megapixels size icon cache downloads tab jpg jpeg png webp gif video quality format'

export function HistoryPanel({ query = '' }: { query?: string }) {
  const downloadThumbMegapixels = useSettingsStore((s) => s.downloadThumbMegapixels)
  const downloadThumbImageFormat = useSettingsStore((s) => s.downloadThumbImageFormat)
  const downloadThumbVideoFormat = useSettingsStore((s) => s.downloadThumbVideoFormat)
  const downloadThumbQuality = useSettingsStore((s) => s.downloadThumbQuality)
  const setDownloadThumbMegapixels = useSettingsStore((s) => s.setDownloadThumbMegapixels)
  const setDownloadThumbImageFormat = useSettingsStore((s) => s.setDownloadThumbImageFormat)
  const setDownloadThumbVideoFormat = useSettingsStore((s) => s.setDownloadThumbVideoFormat)
  const setDownloadThumbQuality = useSettingsStore((s) => s.setDownloadThumbQuality)
  const qualityOff = downloadThumbImageFormat === 'png' && downloadThumbVideoFormat === 'gif'

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <SettingsCard
        query={query}
        title="Thumbnails"
        terms="download history thumbnails megapixels size icon cache jpg jpeg png webp gif video quality format"
      >
        <SettingsBlock query={query} title="Thumbnail megapixels" terms="megapixels size cap resize">
          <SliderField
            value={downloadThumbMegapixels}
            onChange={setDownloadThumbMegapixels}
            min={0.05}
            max={2}
            step={0.05}
          />
          <p className="text-xs text-muted">
            Downloads-tab previews are downscaled to this area. Image and video thumbs share this cap. Larger sources
            are never upscaled. Does not change model thumbnails.
          </p>
        </SettingsBlock>
        <SettingsBlock query={query} title="Image format" terms="png jpg jpeg webp still photo">
          <SelectField
            value={downloadThumbImageFormat}
            onChange={(value) => setDownloadThumbImageFormat(value as ImageFormat)}
            options={[...IMAGE_FORMATS]}
          />
        </SettingsBlock>
        <SettingsBlock query={query} title="Video format" terms="gif webp video animated">
          <SelectField
            value={downloadThumbVideoFormat}
            onChange={(value) => setDownloadThumbVideoFormat(value as AnimatedThumbFormat)}
            options={[...ANIMATED_THUMB_FORMATS]}
          />
          <p className="text-xs text-muted">
            Stills use the image format. GIF, animated WebP, and video previews use the video format.
          </p>
        </SettingsBlock>
        <SettingsBlock query={query} title="Thumbnail quality" terms="jpeg webp jpg quality">
          <div className={qualityOff ? 'pointer-events-none opacity-40' : ''}>
            <SliderField value={downloadThumbQuality} onChange={setDownloadThumbQuality} min={1} max={100} />
          </div>
          <p className="text-xs text-muted">Used for JPEG and WebP.</p>
        </SettingsBlock>
      </SettingsCard>
    </div>
  )
}
