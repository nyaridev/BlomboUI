import { ChipInput } from '@/components/controls/chip-input/ChipInput.tsx'
import { ChipSelect } from '@/components/controls/chip-select/ChipSelect.tsx'
import { NumberField } from '@/components/controls/number/NumberField.tsx'
import { SelectField } from '@/components/controls/select/SelectField.tsx'
import { SliderField } from '@/components/controls/slider/SliderField.tsx'
import { CheckboxControl } from '@/components/controls/toggle/CheckboxControl.tsx'
import { getKSamplerChoices, getWorkflows } from '@/lib/api.ts'
import { SAMPLERS, SCHEDULERS } from '@/views/generate/panels/generation/sections/params/resolutions.ts'
import { SettingsBlock, SettingsCard } from '@/views/settings/panels/content/SettingsBlock.tsx'
import { SettingsField, SettingsReset } from '@/views/settings/panels/content/SettingsReset.tsx'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useEffect, useState } from 'react'

export const GENERATION_QUERY =
  'generation preview every last batch first sampling samplers schedulers ksampler generate lora strength slider min max prompt weight step attention auto apply instant trigger start end resolution set custom width height vram unload krea2 workflow clip'

export function GenerationSection({ query = '' }: { query?: string }) {
  const hiddenSamplers = useSettingsStore((s) => s.hiddenSamplers) ?? []
  const hiddenSchedulers = useSettingsStore((s) => s.hiddenSchedulers) ?? []
  const setHiddenSamplers = useSettingsStore((s) => s.setHiddenSamplers)
  const setHiddenSchedulers = useSettingsStore((s) => s.setHiddenSchedulers)
  const vramUnloadWorkflows = useSettingsStore((s) => s.vramUnloadWorkflows)
  const vramUnloadOnPrompt = useSettingsStore((s) => s.vramUnloadOnPrompt)
  const vramUnloadOnWeights = useSettingsStore((s) => s.vramUnloadOnWeights)
  const setVramUnloadWorkflows = useSettingsStore((s) => s.setVramUnloadWorkflows)
  const setVramUnloadOnPrompt = useSettingsStore((s) => s.setVramUnloadOnPrompt)
  const setVramUnloadOnWeights = useSettingsStore((s) => s.setVramUnloadOnWeights)
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
  const setResolutions = useSettingsStore((s) => s.setResolutions)
  const setSetResolutions = useSettingsStore((s) => s.setSetResolutions)
  const [samplers, setSamplers] = useState<string[]>([...SAMPLERS])
  const [schedulers, setSchedulers] = useState<string[]>([...SCHEDULERS])
  const [workflows, setWorkflows] = useState<{ id: string; name: string }[]>([{ id: 'krea2', name: 'Krea2' }])

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
    void getWorkflows()
      .then((rows) => {
        if (rows.length) {
          setWorkflows(rows.map((row) => ({ id: row.id, name: row.name || row.id })))
        }
      })
      .catch(() => {})
  }, [])

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <SettingsCard query={query} title="Preview" terms="generation preview every step last sampling">
        <SettingsField setting="genPreview">
          <label className="flex items-center gap-2 text-sm text-ink">
            <CheckboxControl checked={genPreview} onChange={setGenPreview} />
            Show preview during generation
          </label>
        </SettingsField>
        <div className={genPreview ? 'flex flex-col gap-3' : 'pointer-events-none flex flex-col gap-3 opacity-40'}>
          <SettingsBlock query={query} title="Show preview every step" terms="every interval" setting="genPreviewEvery">
            <SliderField value={genPreviewEvery} onChange={setGenPreviewEvery} min={1} max={50} />
          </SettingsBlock>
          <SettingsBlock query={query} title="Show first preview after" terms="first after delay steps" setting="genPreviewAfter">
            <SliderField value={genPreviewAfter} onChange={setGenPreviewAfter} min={1} max={50} />
            <p className="text-xs text-muted">
              First preview is the next multiple of the interval that is at least this many steps. Every 4 after 8 shows
              at 8; every 4 after 10 shows at 12.
            </p>
            <SettingsField setting="genPreviewAfterFirst">
              <label className="flex items-center gap-2 text-sm text-ink">
                <CheckboxControl checked={genPreviewAfterFirst} onChange={setGenPreviewAfterFirst} />
                Only wait on the first image in a batch
              </label>
            </SettingsField>
            <p className="text-xs text-muted">
              Later images start on the every-step interval instead of waiting again.
            </p>
          </SettingsBlock>
          <SettingsField setting="genPreviewLast">
            <label className="flex items-center gap-2 text-sm text-ink">
              <CheckboxControl checked={genPreviewLast} onChange={setGenPreviewLast} />
              Include last step in preview
            </label>
          </SettingsField>
        </div>
      </SettingsCard>
      <SettingsCard query={query} title="Sampling" terms="hidden samplers schedulers ksampler hide chips">
        <SettingsBlock query={query} title="Hidden samplers" terms="ksampler hide chips" setting="hiddenSamplers">
          <ChipSelect
            options={[...new Set([...samplers, ...hiddenSamplers])]}
            value={hiddenSamplers}
            onChange={setHiddenSamplers}
            placeholder="Select samplers to hide…"
          />
          <p className="text-xs text-muted">Selected samplers are removed from the generate picker.</p>
        </SettingsBlock>
        <SettingsBlock query={query} title="Hidden schedulers" terms="ksampler hide chips" setting="hiddenSchedulers">
          <ChipSelect
            options={[...new Set([...schedulers, ...hiddenSchedulers])]}
            value={hiddenSchedulers}
            onChange={setHiddenSchedulers}
            placeholder="Select schedulers to hide…"
          />
          <p className="text-xs text-muted">Selected schedulers are removed from the generate picker.</p>
        </SettingsBlock>
      </SettingsCard>
      <SettingsCard query={query} title="VRAM unload" terms="vram unload krea2 workflow clip prompt lora attention model">
        <SettingsBlock query={query} title="Workflows" terms="krea2 listed unload" setting="vramUnloadWorkflows">
          <ChipSelect
            options={[...new Set([...workflows.map((row) => row.id), ...vramUnloadWorkflows])]}
            value={vramUnloadWorkflows}
            onChange={setVramUnloadWorkflows}
            chipLabel={(id) => workflows.find((row) => row.id === id)?.name ?? id}
            placeholder="Select workflows…"
          />
          <p className="text-xs text-muted">
            Comfy unloads all models before generate on these workflows only. Switching to a listed workflow also
            unloads so a previous model cannot sit in VRAM.
          </p>
        </SettingsBlock>
        <SettingsField setting="vramUnloadOnPrompt">
          <label className="flex items-center gap-2 text-sm text-ink">
            <CheckboxControl checked={vramUnloadOnPrompt} onChange={setVramUnloadOnPrompt} />
            Unload when prompt changes
          </label>
        </SettingsField>
        <SettingsField setting="vramUnloadOnWeights">
          <label className="flex items-center gap-2 text-sm text-ink">
            <CheckboxControl checked={vramUnloadOnWeights} onChange={setVramUnloadOnWeights} />
            Unload when model / LoRA / attention changes
          </label>
        </SettingsField>
        <p className="text-xs text-muted">Both call the same Comfy unload-all. Use them to test prompt vs weights.</p>
      </SettingsCard>
      <SettingsCard query={query} title="Set resolutions" terms="set custom resolution width height generate" setting="setResolutions">
        <ChipInput value={setResolutions} onChange={setSetResolutions} placeholder="1024x1024" />
        <p className="text-xs text-muted">Landscape sizes for the Set picker. Portrait is the swapped pair.</p>
      </SettingsCard>
      <SettingsCard query={query} title="LoRA strength" terms="slider min max 0 1 -5 5 default range">
        <SettingsBlock query={query} title="Default range" terms="slider min max 0 1">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted">Min</span>
                <SettingsReset setting="loraStrengthMin" />
              </span>
              <NumberField value={loraStrengthMin} onChange={setLoraStrengthMin} min={-20} max={20} step={0.05} />
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted">Max</span>
                <SettingsReset setting="loraStrengthMax" />
              </span>
              <NumberField value={loraStrengthMax} onChange={setLoraStrengthMax} min={-20} max={20} step={0.05} />
            </label>
          </div>
          <p className="text-xs text-muted">Used when Slider LoRA is off. Default is 0 to 1.</p>
        </SettingsBlock>
        <SettingsBlock query={query} title="Slider range" terms="strength min max -5 5">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted">Min</span>
                <SettingsReset setting="loraSliderMin" />
              </span>
              <NumberField value={loraSliderMin} onChange={setLoraSliderMin} min={-20} max={20} step={0.05} />
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted">Max</span>
                <SettingsReset setting="loraSliderMax" />
              </span>
              <NumberField value={loraSliderMax} onChange={setLoraSliderMax} min={-20} max={20} step={0.05} />
            </label>
          </div>
          <p className="text-xs text-muted">Used when Slider LoRA is on. Default is -5 to 5.</p>
        </SettingsBlock>
      </SettingsCard>
      <SettingsCard query={query} title="Automatic LoRA" terms="auto apply instant trigger words start end global default">
        <SettingsField setting="loraAutoApply">
          <label className="flex items-center gap-2 text-sm text-ink">
            <CheckboxControl checked={loraAutoApply} onChange={setLoraAutoApply} />
            Apply LoRAs instantly by default
          </label>
        </SettingsField>
        <SettingsBlock query={query} title="Trigger placement" terms="start end prompt trigger words" setting="loraApplyAt">
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
      <SettingsCard query={query} title="Prompt weight" terms="prompt weight attention lora strength step arrow" setting="promptWeightStep">
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
