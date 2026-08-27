import { SelectField } from '@/components/controls/select/SelectField.tsx'
import { SettingsCard } from '@/views/settings/panels/content/SettingsBlock.tsx'
import { useSettingsStore, THEMES, TIME_DISPLAYS, type Theme, type TimeDisplay } from '@/stores/settingsStore.ts'

export const GENERAL_QUERY = 'general theme appearance time display am pm hour clock date'

export function GeneralSection({ query = '' }: { query?: string }) {
  const theme = useSettingsStore((s) => s.theme)
  const timeDisplay = useSettingsStore((s) => s.timeDisplay)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const setTimeDisplay = useSettingsStore((s) => s.setTimeDisplay)

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <SettingsCard query={query} title="Appearance" terms="theme appearance dark" setting="theme">
        <SelectField value={theme} onChange={(value) => setTheme(value as Theme)} options={[...THEMES]} />
      </SettingsCard>
      <SettingsCard query={query} title="Time display" terms="time clock hour am pm 24 full" setting="timeDisplay">
        <SelectField
          value={timeDisplay}
          onChange={(value) => setTimeDisplay(value as TimeDisplay)}
          options={[...TIME_DISPLAYS]}
        />
        <p className="text-xs text-muted">Used for dates on model info and trash.</p>
      </SettingsCard>
    </div>
  )
}
