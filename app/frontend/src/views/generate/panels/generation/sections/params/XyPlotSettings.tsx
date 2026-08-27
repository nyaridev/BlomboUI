import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { ChipSelect } from '@/components/controls/chip-select/ChipSelect.tsx'
import { SelectField } from '@/components/controls/select/SelectField.tsx'
import { SliderField } from '@/components/controls/slider/SliderField.tsx'
import { CheckboxControl } from '@/components/controls/toggle/CheckboxControl.tsx'
import { IconButton } from '@/components/controls/button/IconButton.tsx'
import { getKSamplerChoices } from '@/lib/api.ts'
import { useGenerateStore } from '@/stores/generateStore.ts'
import { modelPath, useModelsStore } from '@/stores/modelsStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useEffect, useMemo, useState } from 'react'
import { listedChoices, SAMPLERS, SCHEDULERS } from '@/views/generate/panels/generation/sections/params/resolutions.ts'
import {
  xyTypeAllowsCustom,
  xyTypeOptions,
  xyTypeUsesOptions,
  type XyAxisSettings,
  type XyAxisType,
  type XyPlotSettings,
} from '@/views/generate/panels/generation/sections/params/xyPlot.ts'

function fileStem(path: string) {
  const base = path.replace(/\\/g, '/').split('/').pop() || path
  return base.replace(/\.[^/.]+$/, '') || base
}

function promptTags(prompt: string, negative: string) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const text of [prompt, negative]) {
    for (const part of text.split(',')) {
      const tag = part.trim()
      const key = tag.toLowerCase()
      if (!tag || seen.has(key)) {
        continue
      }
      seen.add(key)
      out.push(tag)
    }
  }
  return out
}

function AxisRow({
  label,
  axis,
  otherType,
  params,
  comfyOk,
  onChange,
}: {
  label: string
  axis: XyAxisSettings
  otherType: string
  params: string[]
  comfyOk: boolean
  onChange: (axis: XyAxisSettings) => void
}) {
  const checkpoints = useModelsStore((s) => s.checkpoints)
  const diffusionModels = useModelsStore((s) => s.diffusion_models)
  const loras = useModelsStore((s) => s.loras)
  const vaes = useModelsStore((s) => s.vae)
  const textEncoders = useModelsStore((s) => s.text_encoders)
  const hiddenSamplers = useSettingsStore((s) => s.hiddenSamplers)
  const hiddenSchedulers = useSettingsStore((s) => s.hiddenSchedulers)
  const setResolutions = useSettingsStore((s) => s.setResolutions)
  const prompt = useGenerateStore((s) => s.prompt)
  const negativePrompt = useGenerateStore((s) => s.negativePrompt)
  const [samplers, setSamplers] = useState<string[]>([...SAMPLERS])
  const [schedulers, setSchedulers] = useState<string[]>([...SCHEDULERS])

  useEffect(() => {
    if (!comfyOk) {
      return
    }
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
  }, [comfyOk])

  const models = useMemo(() => {
    if (axis.type === 'checkpoint') {
      return [...checkpoints, ...diffusionModels]
    }
    if (axis.type === 'vae') {
      return vaes
    }
    if (axis.type === 'text_encoder') {
      return textEncoders
    }
    if (axis.type === 'lora') {
      return loras
    }
    return []
  }, [axis.type, checkpoints, diffusionModels, loras, textEncoders, vaes])

  const options = useMemo(() => {
    if (axis.type === 'sampler') {
      return listedChoices(samplers, hiddenSamplers, axis.values.find((item) => samplers.includes(item)) || samplers[0] || '')
    }
    if (axis.type === 'scheduler') {
      return listedChoices(schedulers, hiddenSchedulers, axis.values.find((item) => schedulers.includes(item)) || schedulers[0] || '')
    }
    if (axis.type === 'resolution') {
      return [...new Set([...setResolutions, ...axis.values])]
    }
    if (axis.type === 'prompt_sr') {
      return axis.values.length === 0 ? promptTags(prompt, negativePrompt) : []
    }
    if (xyTypeUsesOptions(axis.type)) {
      return models.map((item) => modelPath(item)).filter(Boolean)
    }
    return []
  }, [axis.type, axis.values, hiddenSamplers, hiddenSchedulers, models, negativePrompt, prompt, samplers, schedulers, setResolutions])

  const inactive = axis.type === 'none'

  return (
    <div className="scripts-select-placeholder grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] items-start gap-2">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs text-muted">{label} Type</span>
        <SelectField
          value={axis.type}
          onChange={(value) => onChange({ type: value as XyAxisType, values: [] })}
          options={xyTypeOptions(params, otherType)}
        />
      </div>
      <div className={['flex min-w-0 flex-col gap-1', inactive ? 'pointer-events-none opacity-50' : ''].filter(Boolean).join(' ')}>
        <span className="text-xs text-muted">{label} value</span>
        <ChipSelect
          options={inactive ? [] : options}
          value={inactive ? [] : axis.values}
          onChange={(values) => {
            if (!inactive) {
              onChange({ ...axis, values })
            }
          }}
          allowCustom={!inactive && xyTypeAllowsCustom(axis.type)}
          chipLabel={
            axis.type === 'checkpoint' || axis.type === 'vae' || axis.type === 'text_encoder' || axis.type === 'lora'
              ? fileStem
              : undefined
          }
          placeholder={inactive ? 'Select a type first…' : xyTypeAllowsCustom(axis.type) ? 'Select or type…' : 'Select…'}
          chipClassName={() => 'bg-field text-ink'}
        />
      </div>
    </div>
  )
}

export function XyPlotSettings({
  value,
  onChange,
  workflowParams,
  comfyOk,
}: {
  value: XyPlotSettings
  onChange: (value: XyPlotSettings) => void
  workflowParams: string[]
  comfyOk: boolean
}) {
  function swap() {
    onChange({ ...value, x: value.y, y: value.x })
  }

  return (
    <div className="flex flex-col gap-3">
    <div className="flex min-w-0 items-center gap-2">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <AxisRow
          label="X"
          axis={value.x}
          otherType={value.y.type}
          params={workflowParams}
          comfyOk={comfyOk}
          onChange={(x) => onChange({ ...value, x })}
        />
        <AxisRow
          label="Y"
          axis={value.y}
          otherType={value.x.type}
          params={workflowParams}
          comfyOk={comfyOk}
          onChange={(y) => onChange({ ...value, y })}
        />
      </div>
      <IconButton className="shrink-0" aria-label="Swap X/Y axes" onClick={swap}><AppIcon id="arrow-up-down" /></IconButton>
    </div>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm text-ink">
          <CheckboxControl checked={value.drawLegend} onChange={(checked) => onChange({ ...value, drawLegend: checked })} />
          Draw legend
        </label>
        <label className={['flex items-center gap-2 text-sm text-ink', value.drawLegend ? '' : 'pointer-events-none opacity-50'].filter(Boolean).join(' ')}>
          <CheckboxControl checked={value.drawType} disabled={!value.drawLegend} onChange={(checked) => onChange({ ...value, drawType: checked })} />
          Draw type
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <CheckboxControl checked={value.keepMinusOne} onChange={(checked) => onChange({ ...value, keepMinusOne: checked })} />
          Keep -1 for seeds
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <CheckboxControl checked={value.includeSubImages} onChange={(checked) => onChange({ ...value, includeSubImages: checked })} />
          Include sub images
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <CheckboxControl checked={Boolean(value.respectInstantLora)} onChange={(checked) => onChange({ ...value, respectInstantLora: checked })} />
          Respect instant LoRA
        </label>
      </div>
      <SliderField
        label="Grid margins (px)"
        value={value.gridMargin}
        onChange={(gridMargin) => onChange({ ...value, gridMargin })}
        min={0}
        max={256}
      />
    </div>
  )
}
