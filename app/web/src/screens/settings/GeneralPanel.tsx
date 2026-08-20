import { SelectField } from '@/components/SelectField.tsx'
import { SettingsCard } from './SettingsBlock.tsx'
import {
  useSettingsStore,
  THEMES,
  CIVITAI_SITES,
  TIME_DISPLAYS,
  type Theme,
  type CivitaiSite,
  type TimeDisplay,
} from '@/stores/settingsStore.ts'

export const GENERAL_QUERY = 'general theme civitai site red appearance time display am pm hour'

export function GeneralPanel({ query = '' }: { query?: string }) {
  const theme = useSettingsStore((s) => s.theme)
  const civitaiSite = useSettingsStore((s) => s.civitaiSite)
  const timeDisplay = useSettingsStore((s) => s.timeDisplay)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const setCivitaiSite = useSettingsStore((s) => s.setCivitaiSite)
  const setTimeDisplay = useSettingsStore((s) => s.setTimeDisplay)

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <SettingsCard query={query} title="Appearance" terms="theme appearance dark">
        <SelectField value={theme} onChange={(value) => setTheme(value as Theme)} options={THEMES} />
      </SettingsCard>
      <SettingsCard query={query} title="Time display" terms="time clock hour am pm 24 full">
        <SelectField
          value={timeDisplay}
          onChange={(value) => setTimeDisplay(value as TimeDisplay)}
          options={[...TIME_DISPLAYS]}
        />
        <p className="text-xs text-muted">Used for dates on model info and trash.</p>
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
