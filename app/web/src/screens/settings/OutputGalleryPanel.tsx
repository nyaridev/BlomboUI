import { SettingsCard } from './SettingsBlock.tsx'
import { useSettingsStore } from '@/stores/settingsStore.ts'

export const OUTPUT_GALLERY_QUERY = 'gallery images photos interrupted skip cancel hide show unfinished preview'

export function OutputGalleryPanel({ query = '' }: { query?: string }) {
  const galleryHideInterrupted = useSettingsStore((s) => s.galleryHideInterrupted)
  const setGalleryHideInterrupted = useSettingsStore((s) => s.setGalleryHideInterrupted)

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <SettingsCard query={query} title="Interrupted images" terms="skip cancel hide unfinished preview">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="check"
            checked={galleryHideInterrupted}
            onChange={(event) => setGalleryHideInterrupted(event.target.checked)}
          />
          Hide interrupted images
        </label>
        <p className="text-xs text-muted">
          Off shows photos saved from a cancelled or skipped generation. They stay on disk either way.
        </p>
      </SettingsCard>
    </div>
  )
}
