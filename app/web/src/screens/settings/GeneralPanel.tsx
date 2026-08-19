import { ChipSelect } from '@/components/ChipSelect.tsx'
import { SelectField } from '@/components/SelectField.tsx'
import { HIDEABLE_GENERATE_TABS, type GenerateTab } from '@/screens/generate/tabs.ts'
import { MODEL_TYPE_SECTIONS } from '@/lib/modelTypes.ts'
import { SettingsBlock } from './SettingsBlock.tsx'
import { useSettingsStore, THEMES, CIVITAI_SITES, type Theme, type CivitaiSite } from '@/stores/settingsStore.ts'

export const GENERAL_QUERY =
  'general theme exclude generate tabs hidden model types picker chips civitai site red wildcards yaml filename'

export function GeneralPanel({ query = '' }: { query?: string }) {
  const hiddenGenerateTabs = useSettingsStore((s) => s.hiddenGenerateTabs) ?? []
  const hiddenModelTypes = useSettingsStore((s) => s.hiddenModelTypes) ?? []
  const theme = useSettingsStore((s) => s.theme)
  const civitaiSite = useSettingsStore((s) => s.civitaiSite)
  const wildcardYamlByFilename = useSettingsStore((s) => s.wildcardYamlByFilename)
  const setHiddenGenerateTabs = useSettingsStore((s) => s.setHiddenGenerateTabs)
  const setHiddenModelTypes = useSettingsStore((s) => s.setHiddenModelTypes)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const setCivitaiSite = useSettingsStore((s) => s.setCivitaiSite)
  const setWildcardYamlByFilename = useSettingsStore((s) => s.setWildcardYamlByFilename)

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <SettingsBlock query={query} title="Theme" terms="appearance dark">
        <SelectField value={theme} onChange={(value) => setTheme(value as Theme)} options={THEMES} />
      </SettingsBlock>
      <SettingsBlock query={query} title="Preferred Civitai site" terms="civitai.red com links">
        <SelectField
          value={civitaiSite}
          onChange={(value) => setCivitaiSite(value as CivitaiSite)}
          options={CIVITAI_SITES}
        />
        <p className="text-xs text-muted">Used for creator, base model, and model links on File Info.</p>
      </SettingsBlock>
      <SettingsBlock query={query} title="Exclude generate tabs" terms="hidden tabs">
        <ChipSelect
          options={[...HIDEABLE_GENERATE_TABS]}
          value={hiddenGenerateTabs.filter((item) => item !== 'Generation')}
          onChange={(value) => setHiddenGenerateTabs(value as GenerateTab[])}
          placeholder="Select tabs to hide…"
        />
        <p className="text-xs text-muted">Selected tabs are hidden on the generate screen.</p>
      </SettingsBlock>
      <SettingsBlock query={query} title="Hidden model types" terms="picker chips">
        <ChipSelect
          options={MODEL_TYPE_SECTIONS}
          value={hiddenModelTypes}
          onChange={setHiddenModelTypes}
          placeholder="Select types to hide…"
        />
        <p className="text-xs text-muted">
          Selected types stay out of the picker. Chips already on a model still show; remove one and it cannot be added
          again until you unhide it here.
        </p>
      </SettingsBlock>
      <SettingsBlock query={query} title="Call YAML wildcards by file name" terms="wildcards yaml filename alias">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="check"
            checked={wildcardYamlByFilename}
            onChange={(e) => setWildcardYamlByFilename(e.target.checked)}
          />
          Resolve YAML tags from the file stem as well as general_name
        </label>
        <p className="text-xs text-muted">
          Off (default) uses general_name only. The tree still shows general_name either way.
        </p>
      </SettingsBlock>
    </div>
  )
}
