import { ChipSelect } from '@/components/primitives/ChipSelect.tsx'
import { NumberField } from '@/components/primitives/NumberField.tsx'
import { SelectField } from '@/components/primitives/SelectField.tsx'
import { SliderField } from '@/components/primitives/SliderField.tsx'
import { getKSamplerChoices } from '@/lib/api.ts'
import { MODEL_TYPE_SECTIONS } from '@/lib/modelTypes.ts'
import { SAMPLERS, SCHEDULERS } from '@/screens/generate/resolutions.ts'
import { SettingsBlock, SettingsCard } from './SettingsBlock.tsx'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useEffect, useState } from 'react'

export const MODELS_QUERY =
  'models hidden types picker chips sampling samplers schedulers ksampler generate lora strength slider min max prompt weight step attention preview every last batch first auto apply instant trigger start end'

export function ModelsPanel({ query = '' }: { query?: string }) {
  const hiddenModelTypes = useSettingsStore((s) => s.hiddenModelTypes) ?? []
  const hiddenSamplers = useSettingsStore((s) => s.hiddenSamplers) ?? []
  const hiddenSchedulers = useSettingsStore((s) => s.hiddenSchedulers) ?? []
  const setHiddenModelTypes = useSettingsStore((s) => s.setHiddenModelTypes)
  const setHiddenSamplers = useSettingsStore((s) => s.setHiddenSamplers)
  const setHiddenSchedulers = useSettingsStore((s) => s.setHiddenSchedulers)
  const loraStrengthMin = useSettingsStore((s) => s.loraStrengthMin)
  const loraStrengthMax = useSettingsStore((s) => s.loraStrengthMax)
  const loraSliderMin = useSettingsStore((s) => s.loraSliderMin)
  const loraSliderMax = useSettingsStore((s) => s.loraSliderMax)
  const setLoraStrengthMin = useSettingsStore((s) => s.setLoraStrengthMin)
  const setLoraStrengthMax = useSettingsStore((s) => s.setLoraStrengthMax)
  const setLoraSliderMin = useSettingsStore((s) => s.setLoraSliderMin)
  const setLoraSliderMax = useSettingsStore((s) => s.setLoraSliderMax)
  const loraAutoApply = useSettingsStore((s) => s.loraAutoApply)
  const loraApplyAt = useSettingsStore((s) => s.loraApplyAt)
  const setLoraAutoApply = useSettingsStore((s) => s.setLoraAutoApply)
  const setLoraApplyAt = useSettingsStore((s) => s.setLoraApplyAt)
  const promptWeightStep = useSettingsStore((s) => s.promptWeightStep)
  const setPromptWeightStep = useSettingsStore((s) => s.setPromptWeightStep)
  const genPreview = useSettingsStore((s) => s.genPreview)
  const genPreviewEvery = useSettingsStore((s) => s.genPreviewEvery)
  const genPreviewAfter = useSettingsStore((s) => s.genPreviewAfter)
  const genPreviewLast = useSettingsStore((s) => s.genPreviewLast)
  const genPreviewAfterFirst = useSettingsStore((s) => s.genPreviewAfterFirst)
  const setGenPreview = useSettingsStore((s) => s.setGenPreview)
  const setGenPreviewEvery = useSettingsStore((s) => s.setGenPreviewEvery)
  const setGenPreviewAfter = useSettingsStore((s) => s.setGenPreviewAfter)
  const setGenPreviewLast = useSettingsStore((s) => s.setGenPreviewLast)
  const setGenPreviewAfterFirst = useSettingsStore((s) => s.setGenPreviewAfterFirst)
  const [samplers, setSamplers] = useState<string[]>([...SAMPLERS])
  const [schedulers, setSchedulers] = useState<string[]>([...SCHEDULERS])

  useEffect(() => {
    void getKSamplerChoices()
      .then((data) => {
        if (data.samplers.length) {
          setSamplers(data.samplers)
        }
        if (data.schedulers.length) {
          setSchedulers(data.schedulers)
        }
      })
      .catch(() => {})
  }, [])

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <SettingsCard query={query} title="Preview" terms="generation preview every step last sampling">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="check"
            checked={genPreview}
            onChange={(e) => setGenPreview(e.target.checked)}
          />
          Show preview during generation
        </label>
        <div className={genPreview ? 'flex flex-col gap-3' : 'pointer-events-none flex flex-col gap-3 opacity-40'}>
          <SettingsBlock query={query} title="Show preview every step" terms="every interval">
            <SliderField value={genPreviewEvery} onChange={setGenPreviewEvery} min={1} max={50} />
          </SettingsBlock>
          <SettingsBlock query={query} title="Show first preview after" terms="first after delay steps">
            <SliderField value={genPreviewAfter} onChange={setGenPreviewAfter} min={1} max={50} />
            <p className="text-xs text-muted">
              First preview is the next multiple of the interval that is at least this many steps. Every 4 after 8 shows
              at 8; every 4 after 10 shows at 12.
            </p>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                className="check"
                checked={genPreviewAfterFirst}
                onChange={(e) => setGenPreviewAfterFirst(e.target.checked)}
              />
              Only wait on the first image in a batch
            </label>
            <p className="text-xs text-muted">
              Later images start on the every-step interval instead of waiting again.
            </p>
          </SettingsBlock>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="check"
              checked={genPreviewLast}
              onChange={(e) => setGenPreviewLast(e.target.checked)}
            />
            Include last step in preview
          </label>
        </div>
      </SettingsCard>
      <SettingsCard query={query} title="Sampling" terms="hidden samplers schedulers ksampler hide chips">
        <SettingsBlock query={query} title="Hidden samplers" terms="ksampler hide chips">
          <ChipSelect
            options={[...new Set([...samplers, ...hiddenSamplers])]}
            value={hiddenSamplers}
            onChange={setHiddenSamplers}
            placeholder="Select samplers to hide…"
          />
          <p className="text-xs text-muted">Selected samplers are removed from the generate picker.</p>
        </SettingsBlock>
        <SettingsBlock query={query} title="Hidden schedulers" terms="ksampler hide chips">
          <ChipSelect
            options={[...new Set([...schedulers, ...hiddenSchedulers])]}
            value={hiddenSchedulers}
            onChange={setHiddenSchedulers}
            placeholder="Select schedulers to hide…"
          />
          <p className="text-xs text-muted">Selected schedulers are removed from the generate picker.</p>
        </SettingsBlock>
      </SettingsCard>
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
      <SettingsCard query={query} title="LoRA strength" terms="slider min max 0 1 -5 5 default range">
        <SettingsBlock query={query} title="Default range" terms="slider min max 0 1">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">Min</span>
              <NumberField value={loraStrengthMin} onChange={setLoraStrengthMin} min={-20} max={20} step={0.05} />
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">Max</span>
              <NumberField value={loraStrengthMax} onChange={setLoraStrengthMax} min={-20} max={20} step={0.05} />
            </label>
          </div>
          <p className="text-xs text-muted">Used when Slider LoRA is off. Default is 0 to 1.</p>
        </SettingsBlock>
        <SettingsBlock query={query} title="Slider range" terms="strength min max -5 5">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">Min</span>
              <NumberField value={loraSliderMin} onChange={setLoraSliderMin} min={-20} max={20} step={0.05} />
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">Max</span>
              <NumberField value={loraSliderMax} onChange={setLoraSliderMax} min={-20} max={20} step={0.05} />
            </label>
          </div>
          <p className="text-xs text-muted">Used when Slider LoRA is on. Default is -5 to 5.</p>
        </SettingsBlock>
      </SettingsCard>
      <SettingsCard query={query} title="Automatic LoRA" terms="auto apply instant trigger words start end global default">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="check"
            checked={loraAutoApply}
            onChange={(event) => setLoraAutoApply(event.target.checked)}
          />
          Apply LoRAs instantly by default
        </label>
        <SettingsBlock query={query} title="Trigger placement" terms="start end prompt trigger words">
          <SelectField
            value={loraApplyAt}
            options={[
              { value: 'start', label: 'Start' },
              { value: 'end', label: 'End' },
            ]}
            onChange={(value) => setLoraApplyAt(value === 'end' ? 'end' : 'start')}
          />
          <p className="text-xs text-muted">
            LoRA trigger words use this position unless a LoRA has its own setting.
          </p>
        </SettingsBlock>
      </SettingsCard>
      <SettingsCard query={query} title="Prompt weight" terms="prompt weight attention lora strength step arrow">
        <label className="flex min-w-0 max-w-40 flex-col gap-1">
          <span className="text-xs text-muted">Step</span>
          <NumberField value={promptWeightStep} onChange={setPromptWeightStep} min={0.01} max={1} step={0.01} />
        </label>
        <p className="text-xs text-muted">
          Ctrl+Up / Ctrl+Down on selected text wraps it as (text:1.1). At 1.0 the wrap is removed. Selecting a LoRA tag
          changes its strength instead.
        </p>
      </SettingsCard>
    </div>
  )
}
