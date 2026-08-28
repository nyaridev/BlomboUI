import { NumberField } from '@/components/controls/number/NumberField.tsx'
import { SettingsBlock, SettingsCard } from '@/views/settings/panels/content/SettingsBlock.tsx'
import { useSettingsStore } from '@/stores/settingsStore.ts'

export const TEMP_QUERY = 'temp temporary runtime hires hiresfix compare clean days purge first pass'

export function TempSection({ query = '' }: { query?: string }) {
  const hiresTempAfterDays = useSettingsStore((s) => s.hiresTempAfterDays)
  const setHiresTempAfterDays = useSettingsStore((s) => s.setHiresTempAfterDays)

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <SettingsCard query={query} title="Hires. fix" terms="hires hiresfix temp compare first pass">
        <SettingsBlock
          query={query}
          title="Clean hires temp after"
          terms="temp compare clean days purge first pass"
          setting="hiresTempAfterDays"
        >
          <NumberField value={hiresTempAfterDays} onChange={setHiresTempAfterDays} min={1} max={365} suffix="d" />
          <p className="text-xs text-muted">
            First-pass compare files in runtime/tmp when Save image before hires.fix is off. Checked on launch.
          </p>
        </SettingsBlock>
      </SettingsCard>
    </div>
  )
}
