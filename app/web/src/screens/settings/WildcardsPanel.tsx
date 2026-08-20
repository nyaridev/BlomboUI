import { SettingsCard } from './SettingsBlock.tsx'
import { useSettingsStore } from '@/stores/settingsStore.ts'

export const WILDCARDS_QUERY = 'wildcards yaml filename alias general_name stem'

export function WildcardsPanel({ query = '' }: { query?: string }) {
  const wildcardYamlByFilename = useSettingsStore((s) => s.wildcardYamlByFilename)
  const setWildcardYamlByFilename = useSettingsStore((s) => s.setWildcardYamlByFilename)

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <SettingsCard query={query} title="YAML tags" terms="wildcards yaml filename alias general_name stem">
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
      </SettingsCard>
    </div>
  )
}
