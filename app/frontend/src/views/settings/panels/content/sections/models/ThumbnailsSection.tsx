import { SelectField } from '@/components/controls/select/SelectField.tsx'
import { SliderField } from '@/components/controls/slider/SliderField.tsx'
import { CheckboxControl } from '@/components/controls/toggle/CheckboxControl.tsx'
import { SettingsBlock, SettingsCard } from '@/views/settings/panels/content/SettingsBlock.tsx'
import { SettingsField } from '@/views/settings/panels/content/SettingsReset.tsx'
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

export function ThumbnailsSection({ query = '' }: { query?: string }) {
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
        <SettingsBlock query={query} title="Thumbnail megapixels" terms="megapixels size cap resize" setting="thumbMegapixels">
          <SliderField value={thumbMegapixels} onChange={setThumbMegapixels} min={0.05} max={2} step={0.05} />
          <p className="text-xs text-muted">
            Small thumbs are downscaled to this area. Larger images are never upscaled.
          </p>
        </SettingsBlock>
        <SettingsBlock query={query} title="Thumbnail format" terms="png jpg jpeg webp extension" setting="thumbFormat">
          <SelectField
            value={thumbFormat}
            onChange={(value) => setThumbFormat(value as ImageFormat)}
            options={[...IMAGE_FORMATS]}
          />
        </SettingsBlock>
        <SettingsBlock query={query} title="Thumbnail quality" terms="jpeg webp jpg quality" setting="thumbQuality">
          <div className={thumbFormat === 'png' ? 'pointer-events-none opacity-40' : ''}>
            <SliderField value={thumbQuality} onChange={setThumbQuality} min={1} max={100} />
          </div>
          <p className="text-xs text-muted">Used for JPEG and WebP.</p>
        </SettingsBlock>
        <SettingsField setting="saveRawThumbs">
          <label className="flex items-center gap-2 text-sm text-ink">
            <CheckboxControl checked={saveRawThumbs} onChange={setSaveRawThumbs} />
            Save raw thumbnails
          </label>
        </SettingsField>
        <p className="text-xs text-muted">
          Also write a full-size copy next to the thumbnail as {'{context}'}_raw, encoded with Files → Saving image
          format and quality. Scopes still resolve the same context. Small tiles keep using the thumbnail; large tiles
          and opened photos use the raw file when it exists.
        </p>
        <SettingsField setting="saveAnimatedThumbs">
          <label className="flex items-center gap-2 text-sm text-ink">
            <CheckboxControl checked={saveAnimatedThumbs} onChange={setSaveAnimatedThumbs} />
            Save animated thumbnails
          </label>
        </SettingsField>
        <SettingsBlock query={query} title="Animated format" terms="gif webp video animated" setting="animatedThumbFormat">
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
        setting="thumbSaveTo"
      >
        <SelectField
          value={thumbSaveTo}
          onChange={(value) => setThumbSaveTo(value === 'active' ? 'active' : 'global')}
          options={[...SAVE_TO]}
        />
        <p className="text-xs text-muted">
          Civitai scrape, fill, and Model Info / File Info Civitai thumbnails. Active uses Generate gallery scopes.
          Manual Model Info saves use the picker on that gallery.
        </p>
      </SettingsCard>
      <SettingsCard query={query} title="Other views" terms="trash vae embedding controlnet global fallback">
        <SettingsField setting="trashThumbFallback">
          <label className="flex items-center gap-2 text-sm text-ink">
            <CheckboxControl checked={trashThumbFallback} onChange={setTrashThumbFallback} />
            Use Global thumbnails in trash and other model views
          </label>
        </SettingsField>
        <p className="text-xs text-muted">
          VAE, ControlNet, embeddings, and trash. Picker views use the Global Fallback button on the thumbnail bar.
        </p>
      </SettingsCard>
    </div>
  )
}
