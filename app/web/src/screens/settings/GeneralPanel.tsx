import { SelectField } from '@/components/SelectField.tsx'
import { ChipInput } from '@/components/ChipInput.tsx'
import { SettingsCard } from './SettingsBlock.tsx'
import {
  useSettingsStore,
  THEMES,
  CIVITAI_SITES,
  TIME_DISPLAYS,
  civitaiHost,
  type Theme,
  type CivitaiSite,
  type TimeDisplay,
} from '@/stores/settingsStore.ts'

export const GENERAL_QUERY =
  'general theme civitai site red com api key account appearance time display am pm hour resolution set custom width height'

export function GeneralPanel({ query = '' }: { query?: string }) {
  const theme = useSettingsStore((s) => s.theme)
  const civitaiSite = useSettingsStore((s) => s.civitaiSite)
  const civitaiApiKey = useSettingsStore((s) => s.civitaiApiKey)
  const timeDisplay = useSettingsStore((s) => s.timeDisplay)
  const setResolutions = useSettingsStore((s) => s.setResolutions)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const setCivitaiSite = useSettingsStore((s) => s.setCivitaiSite)
  const setCivitaiApiKey = useSettingsStore((s) => s.setCivitaiApiKey)
  const setTimeDisplay = useSettingsStore((s) => s.setTimeDisplay)
  const setSetResolutions = useSettingsStore((s) => s.setSetResolutions)

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <SettingsCard query={query} title="Appearance" terms="theme appearance dark">
        <SelectField value={theme} onChange={(value) => setTheme(value as Theme)} options={[...THEMES]} />
      </SettingsCard>
      <SettingsCard query={query} title="Time display" terms="time clock hour am pm 24 full">
        <SelectField
          value={timeDisplay}
          onChange={(value) => setTimeDisplay(value as TimeDisplay)}
          options={[...TIME_DISPLAYS]}
        />
        <p className="text-xs text-muted">Used for dates on model info and trash.</p>
      </SettingsCard>
      <SettingsCard query={query} title="Set resolutions" terms="set custom resolution width height generate">
        <ChipInput
          value={setResolutions}
          onChange={setSetResolutions}
          placeholder="1024x1024"
        />
        <p className="text-xs text-muted">Landscape sizes for the Set picker. Portrait is the swapped pair.</p>
      </SettingsCard>
      <SettingsCard query={query} title="Civitai" terms="preferred civitai site red com links api key account">
        <SelectField
          value={civitaiSite}
          onChange={(value) => setCivitaiSite(value as CivitaiSite)}
          options={[...CIVITAI_SITES]}
        />
        <label className="flex flex-col gap-1 text-sm text-ink">
          <span className="text-xs text-muted">API key</span>
          <input
            type="password"
            className="w-full rounded border border-line bg-field px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
            value={civitaiApiKey}
            onChange={(event) => setCivitaiApiKey(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="Optional"
          />
        </label>
        <p className="text-xs text-muted">
          Used for the CivitAI browser on Models → CivitAI.{' '}
          <a
            href={`https://${civitaiHost(civitaiSite)}/user/account`}
            target="_blank"
            rel="noreferrer"
            className="text-purple-bright underline decoration-purple-bright/50 hover:decoration-purple-bright"
          >
            Manage API key
          </a>
        </p>
      </SettingsCard>
    </div>
  )
}
