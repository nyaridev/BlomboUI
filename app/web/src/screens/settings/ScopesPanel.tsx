import { SelectField } from '@/components/primitives/SelectField.tsx'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { SettingsCard } from './SettingsBlock.tsx'

export const SCOPES_QUERY =
  'thumbnail scopes global civitai save destination active fallback trash'

const SAVE_TO = [
  { value: 'global', label: 'Global' },
  { value: 'active', label: 'Active / effective scope' },
] as const

export function ScopesPanel({ query = '' }: { query?: string }) {
  const thumbSaveTo = useSettingsStore((s) => s.thumbSaveTo)
  const trashThumbFallback = useSettingsStore((s) => s.trashThumbFallback)
  const setThumbSaveTo = useSettingsStore((s) => s.setThumbSaveTo)
  const setTrashThumbFallback = useSettingsStore((s) => s.setTrashThumbFallback)

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <SettingsCard query={query} title="Civitai save destination" terms="civitai scrape fill thumbnail save active global model info">
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
            VAE, ControlNet, embeddings, and trash. Gallery views use the Global Fallback button on the thumbnail bar.
          </p>
      </SettingsCard>
    </div>
  )
}
