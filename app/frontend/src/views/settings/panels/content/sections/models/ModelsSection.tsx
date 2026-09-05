import { ChipSelect } from '@/components/controls/chip-select/ChipSelect.tsx'
import { SelectField } from '@/components/controls/select/SelectField.tsx'
import { ButtonControl } from '@/components/controls/button/ButtonControl.tsx'
import { MODEL_TYPE_SECTIONS } from '@/lib/modelTypes.ts'
import { restoreModelData } from '@/lib/api.ts'
import { useModelsStore } from '@/stores/modelsStore.ts'
import { toast } from '@/stores/toastStore.ts'
import { SettingsCard } from '@/views/settings/panels/content/SettingsBlock.tsx'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useState } from 'react'

export const MODELS_QUERY =
  'models hidden types picker chips layout horizontal vertical dialog info restore sidecar folders data thumbnails notes'

const LAYOUT_OPTIONS = [
  { value: 'horizontal', label: 'Horizontal' },
  { value: 'vertical', label: 'Vertical' },
]

export function ModelsSection({ query = '' }: { query?: string }) {
  const hiddenModelTypes = useSettingsStore((s) => s.hiddenModelTypes) ?? []
  const setHiddenModelTypes = useSettingsStore((s) => s.setHiddenModelTypes)
  const modelInfoLayout = useSettingsStore((s) => s.modelInfoLayout)
  const setModelInfoLayout = useSettingsStore((s) => s.setModelInfoLayout)
  const [restoring, setRestoring] = useState(false)

  async function restore() {
    setRestoring(true)
    try {
      const result = await restoreModelData()
      await useModelsStore.getState().pull()
      toast(
        `Restored ${result.models} models, ${result.thumbs} thumbnails` +
          (result.scopesCreated ? `, created ${result.scopesCreated} scopes` : ''),
        'ok',
      )
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not restore model data', 'error')
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <SettingsCard
        query={query}
        title="Model data"
        terms="restore sidecar folders thumbnails notes trigger strength scopes"
      >
        <p className="text-xs text-muted">
          Notes, trigger words, LoRA settings, and thumbnails are stored beside each model file in a folder named
          {' '}
          {'{name}_data'}. Restore reads those folders into this profile after a switch or reinstall.
        </p>
        <ButtonControl type="button" size="sm" disabled={restoring} onClick={() => void restore()}>
          {restoring ? 'Restoring…' : 'Restore from model folders'}
        </ButtonControl>
      </SettingsCard>
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
