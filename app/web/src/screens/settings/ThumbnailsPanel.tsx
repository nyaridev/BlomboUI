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

export const THUMBNAILS_QUERY =
  'thumbnails megapixels format png jpg jpeg webp quality raw scopes global civitai save destination active fallback trash animated gif video'

const SAVE_TO = [
  { value: 'global', label: 'Global' },
  { value: 'active', label: 'Active / effective scope' },
] as const

export function ThumbnailsPanel({ query = '' }: { query?: string }) {
  const thumbMegapixels = useSettingsStore((s) => s.thumbMegapixels)
  const thumbFormat = useSettingsStore((s) => s.thumbFormat)
  const thumbQuality = useSettingsStore((s) => s.thumbQuality)
  const saveRawThumbs = useSettingsStore((s) => s.saveRawThumbs)
  const saveAnimatedThumbs = useSettingsStore((s) => s.saveAnimatedThumbs)
  const animatedThumbFormat = useSettingsStore((s) => s.animatedThumbFormat)
  const setThumbMegapixels = useSettingsStore((s) => s.setThumbMegapixels)
  const setThumbFormat = useSettingsStore((s) => s.setThumbFormat)
  const setThumbQuality = useSettingsStore((s) => s.setThumbQuality)
  const setSaveRawThumbs = useSettingsStore((s) => s.setSaveRawThumbs)
  const setSaveAnimatedThumbs = useSettingsStore((s) => s.setSaveAnimatedThumbs)
  const setAnimatedThumbFormat = useSettingsStore((s) => s.setAnimatedThumbFormat)
  const thumbSaveTo = useSettingsStore((s) => s.thumbSaveTo)
  const trashThumbFallback = useSettingsStore((s) => s.trashThumbFallback)
  const setThumbSaveTo = useSettingsStore((s) => s.setThumbSaveTo)
  const setTrashThumbFallback = useSettingsStore((s) => s.setTrashThumbFallback)

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <SettingsCard query={query} title="Encode" terms="thumbnails megapixels format png jpg jpeg webp quality raw animated gif video">
        <SettingsBlock query={query} title="Thumbnail megapixels" terms="megapixels size cap resize">
          <SliderField value={thumbMegapixels} onChange={setThumbMegapixels} min={0.05} max={2} step={0.05} />
          <p className="text-xs text-muted">
            Small thumbs are downscaled to this area. Larger images are never upscaled.
          </p>
        </SettingsBlock>
        <SettingsBlock query={query} title="Thumbnail format" terms="png jpg jpeg webp extension">
          <SelectField
            value={thumbFormat}
            onChange={(value) => setThumbFormat(value as ImageFormat)}
            options={[...IMAGE_FORMATS]}
          />
        </SettingsBlock>
        <SettingsBlock query={query} title="Thumbnail quality" terms="jpeg webp jpg quality">
          <div className={thumbFormat === 'png' ? 'pointer-events-none opacity-40' : ''}>
            <SliderField value={thumbQuality} onChange={setThumbQuality} min={1} max={100} />
          </div>
          <p className="text-xs text-muted">Used for JPEG and WebP.</p>
        </SettingsBlock>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="check"
            checked={saveRawThumbs}
            onChange={(e) => setSaveRawThumbs(e.target.checked)}
          />
          Save raw thumbnails
        </label>
        <p className="text-xs text-muted">
          Also write a full-size copy next to the thumbnail as {'{context}'}_raw, encoded with Files → Saving image
          format and quality. Scopes still resolve the same context. Small tiles keep using the thumbnail; large tiles
          and opened photos use the raw file when it exists.
        </p>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="check"
            checked={saveAnimatedThumbs}
            onChange={(e) => setSaveAnimatedThumbs(e.target.checked)}
          />
          Save animated thumbnails
        </label>
        <SettingsBlock query={query} title="Animated format" terms="gif webp video animated">
          <div className={saveAnimatedThumbs ? '' : 'pointer-events-none opacity-40'}>
            <SelectField
              value={animatedThumbFormat}
              onChange={(value) => setAnimatedThumbFormat(value as AnimatedThumbFormat)}
              options={[...ANIMATED_THUMB_FORMATS]}
            />
          </div>
          <p className="text-xs text-muted">
            GIF, animated WebP, and video previews are scaled to the thumbnail megapixel cap. Video needs ffmpeg on
            PATH; otherwise MP4 is kept as the thumbnail.
          </p>
        </SettingsBlock>
      </SettingsCard>
      <SettingsCard
        query={query}
        title="Civitai save destination"
        terms="civitai scrape fill thumbnail save active global model info"
      >
        <SelectField
          value={thumbSaveTo}
          onChange={(value) => setThumbSaveTo(value === 'active' ? 'active' : 'global')}
          options={[...SAVE_TO]}
        />
        <p className="text-xs text-muted">
          Civitai scrape, fill, and Model Info / File Info Civitai thumbnails. Manual Model Info saves always use the
          active scope.
        </p>
      </SettingsCard>
      <SettingsCard query={query} title="Other views" terms="trash vae embedding controlnet global fallback">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="check"
            checked={trashThumbFallback}
            onChange={(event) => setTrashThumbFallback(event.target.checked)}
          />
          Use Global thumbnails in trash and other model views
        </label>
        <p className="text-xs text-muted">
          VAE, ControlNet, embeddings, and trash. Picker views use the Global Fallback button on the thumbnail bar.
        </p>
      </SettingsCard>
    </div>
  )
}
