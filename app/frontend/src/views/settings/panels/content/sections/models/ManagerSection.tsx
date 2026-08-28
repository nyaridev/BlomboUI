import { NumberField } from '@/components/controls/number/NumberField.tsx'
import { SelectField } from '@/components/controls/select/SelectField.tsx'
import { SettingsBlock, SettingsCard } from '@/views/settings/panels/content/SettingsBlock.tsx'
import { SettingsField } from '@/views/settings/panels/content/SettingsReset.tsx'
import { useSettingsStore } from '@/stores/settingsStore.ts'

export const MANAGER_QUERY = 'manager download directory folder parallel models catalog install'

export function ManagerSection({ query = '' }: { query?: string }) {
  const modelDirs = useSettingsStore((state) => state.modelDirs)
  const managerQueueParallel = useSettingsStore((state) => state.managerQueueParallel)
  const managerDownloadDirId = useSettingsStore((state) => state.managerDownloadDirId)
  const setManagerQueueParallel = useSettingsStore((state) => state.setManagerQueueParallel)
  const setManagerDownloadDirId = useSettingsStore((state) => state.setManagerDownloadDirId)

  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <SettingsCard query={query} title="Parallel downloads" terms="parallel workers limit" setting="managerQueueParallel">
        <SettingsField setting="managerQueueParallel">
          <NumberField value={managerQueueParallel} onChange={setManagerQueueParallel} min={1} max={20} />
        </SettingsField>
        <p className="text-xs text-muted">How many Manager catalog installs can run at once.</p>
      </SettingsCard>
      <SettingsCard query={query} title="Download directory" terms="manager download destination folder local" setting="managerDownloadDirId">
        <SettingsBlock query={query} title="Save to" terms="directory folder" setting="managerDownloadDirId">
          <SelectField
            value={managerDownloadDirId}
            onChange={setManagerDownloadDirId}
            options={modelDirs.map((item) => ({ value: item.id, label: item.name }))}
          />
        </SettingsBlock>
        <p className="text-xs text-muted">Manager catalog files download into this models folder. Default is Local.</p>
      </SettingsCard>
    </div>
  )
}
