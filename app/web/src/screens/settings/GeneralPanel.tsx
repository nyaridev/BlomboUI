import { SelectField } from '@/components/SelectField.tsx'
import { SettingsCard } from './SettingsBlock.tsx'
import { useSettingsStore, THEMES, CIVITAI_SITES, type Theme, type CivitaiSite } from '@/stores/settingsStore.ts'

export const GENERAL_QUERY = 'general theme civitai site red appearance'

export function GeneralPanel({ query = '' }: { query?: string }) {
  const theme = useSettingsStore((s) => s.theme)
  const civitaiSite = useSettingsStore((s) => s.civitaiSite)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const setCivitaiSite = useSettingsStore((s) => s.setCivitaiSite)

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <SettingsCard query={query} title="Appearance" terms="theme appearance dark">
        <SelectField value={theme} onChange={(value) => setTheme(value as Theme)} options={THEMES} />
      </SettingsCard>
      <SettingsCard query={query} title="Civitai" terms="preferred civitai site red com links">
        <SelectField
          value={civitaiSite}
          onChange={(value) => setCivitaiSite(value as CivitaiSite)}
          options={CIVITAI_SITES}
        />
        <p className="text-xs text-muted">Used for creator, base model, and model links on File Info.</p>
      </SettingsCard>
    </div>
  )
}
