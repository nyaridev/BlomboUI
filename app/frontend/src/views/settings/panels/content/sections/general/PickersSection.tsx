import { SliderField } from '@/components/controls/slider/SliderField.tsx'
import { CheckboxControl } from '@/components/controls/toggle/CheckboxControl.tsx'
import { SettingsCard } from '@/views/settings/panels/content/SettingsBlock.tsx'
import { SettingsField } from '@/views/settings/panels/content/SettingsReset.tsx'
import { useSettingsStore } from '@/stores/settingsStore.ts'

export const GALLERY_QUERY =
  'pickers gallery view tiles scale size tree folder parent unselect'

export function PickersSection({ query = '' }: { query?: string }) {
  const galleryTileScale = useSettingsStore((s) => s.galleryTileScale)
  const galleryParentOnUnselect = useSettingsStore((s) => s.galleryParentOnUnselect)
  const setGalleryTileScale = useSettingsStore((s) => s.setGalleryTileScale)
  const setGalleryParentOnUnselect = useSettingsStore((s) => s.setGalleryParentOnUnselect)

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <p className="text-xs text-muted">
        Used on Generate’s Base Model, LoRA, Wildcards, and Other tabs, and on Models → Local.
      </p>
      <SettingsCard query={query} title="Tiles" terms="tile scale size zoom" setting="galleryTileScale">
        <SliderField value={galleryTileScale} onChange={setGalleryTileScale} min={0.5} max={2} step={0.1} />
        <p className="text-xs text-muted">1 is the current tile size.</p>
      </SettingsCard>
      <SettingsCard query={query} title="Tree" terms="folder directory parent unselect search">
        <SettingsField setting="galleryParentOnUnselect">
          <label className="flex items-center gap-2 text-sm text-ink">
            <CheckboxControl checked={galleryParentOnUnselect} onChange={setGalleryParentOnUnselect} />
            Select parent when unselecting a folder
          </label>
        </SettingsField>
        <p className="text-xs text-muted">
          Clicking the selected folder in the picker tree selects its parent. Off clears the search instead.
        </p>
      </SettingsCard>
    </div>
  )
}
