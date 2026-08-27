import { ChipSelect } from '@/components/controls/chip-select/ChipSelect.tsx'
import { SelectField } from '@/components/controls/select/SelectField.tsx'
import { MODEL_TYPE_SECTIONS } from '@/lib/modelTypes.ts'
import { SettingsCard } from '@/views/settings/panels/content/SettingsBlock.tsx'
import { useSettingsStore } from '@/stores/settingsStore.ts'

export const MODELS_QUERY = 'models hidden types picker chips layout horizontal vertical dialog info'

const LAYOUT_OPTIONS = [
  { value: 'horizontal', label: 'Horizontal' },
  { value: 'vertical', label: 'Vertical' },
]

export function ModelsSection({ query = '' }: { query?: string }) {
  const hiddenModelTypes = useSettingsStore((s) => s.hiddenModelTypes) ?? []
  const setHiddenModelTypes = useSettingsStore((s) => s.setHiddenModelTypes)
  const modelInfoLayout = useSettingsStore((s) => s.modelInfoLayout)
  const setModelInfoLayout = useSettingsStore((s) => s.setModelInfoLayout)

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <SettingsCard
        query={query}
        title="Model info layout"
        terms="layout horizontal vertical dialog info"
        setting="modelInfoLayout"
      >
        <SelectField
          value={modelInfoLayout}
          onChange={(value) => setModelInfoLayout(value === 'vertical' ? 'vertical' : 'horizontal')}
          options={[...LAYOUT_OPTIONS]}
        />
        <p className="text-xs text-muted">
          Preferred layout for the model info dialog. A tall, narrow window still uses vertical; a short window still uses
          horizontal so the dialog stays on screen.
        </p>
      </SettingsCard>
      <SettingsCard query={query} title="Hidden model types" terms="hidden picker chips types" setting="hiddenModelTypes">
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
