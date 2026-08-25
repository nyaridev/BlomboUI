import { ChipSelect } from '@/components/primitives/ChipSelect.tsx'
import { MODEL_TYPE_SECTIONS } from '@/lib/modelTypes.ts'
import { SettingsCard } from './SettingsBlock.tsx'
import { useSettingsStore } from '@/stores/settingsStore.ts'

export const MODELS_QUERY = 'models hidden types picker chips'

export function ModelsPanel({ query = '' }: { query?: string }) {
  const hiddenModelTypes = useSettingsStore((s) => s.hiddenModelTypes) ?? []
  const setHiddenModelTypes = useSettingsStore((s) => s.setHiddenModelTypes)

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <SettingsCard query={query} title="Hidden model types" terms="hidden picker chips types">
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
      </SettingsCard>
    </div>
  )
}
