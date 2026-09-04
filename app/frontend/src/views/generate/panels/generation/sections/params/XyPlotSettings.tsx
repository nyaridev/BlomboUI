import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { FloatingModelsView } from '@/components/composites/models/FloatingModelsView.tsx'
import { ChipSelect } from '@/components/controls/chip-select/ChipSelect.tsx'
import { SelectField } from '@/components/controls/select/SelectField.tsx'
import { SliderField } from '@/components/controls/slider/SliderField.tsx'
import { CheckboxControl } from '@/components/controls/toggle/CheckboxControl.tsx'
import { IconButton } from '@/components/controls/button/IconButton.tsx'
import { getKSamplerChoices, type ModelEntry, type ModelLists } from '@/lib/api.ts'
import { useGenerateStore } from '@/stores/generateStore.ts'
import { modelPath, useModelsStore } from '@/stores/modelsStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useThumbView } from '@/stores/thumbnailScopeStore.ts'
import { useEffect, useMemo, useState } from 'react'
import { listedChoices, SAMPLERS, SCHEDULERS } from '@/views/generate/panels/generation/sections/params/resolutions.ts'
import { PickTile } from '@/views/generate/panels/generation/sections/params/HiresOverrideTiles.tsx'
import { modelTileSpec } from '@/views/generate/panels/chrome/sections/tiles/modelLayouts.ts'
import { useTileReorder } from '@/views/generate/panels/chrome/sections/tiles/useTileReorder.ts'
import {
  xyTypeAllowsCustom,
  xyTypeOptions,
  xyTypeUsesGallery,
  xyTypeUsesOptions,
  type XyAxisSettings,
  type XyAxisType,
  type XyPlotSettings,
} from '@/views/generate/panels/generation/sections/params/xyPlot.ts'

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
    if (xyTypeUsesOptions(axis.type) && !xyTypeUsesGallery(axis.type)) {
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
        {xyTypeUsesGallery(axis.type) ? (
          <AxisModelTiles axis={axis} models={models} onChange={onChange} />
        ) : (
          <ChipSelect
            options={inactive ? [] : options}
            value={inactive ? [] : axis.values}
            onChange={(values) => {
              if (!inactive) {
                onChange({ ...axis, values })
              }
            }}
            allowCustom={!inactive && xyTypeAllowsCustom(axis.type)}
            placeholder={inactive ? 'Select a type first…' : xyTypeAllowsCustom(axis.type) ? 'Select or type…' : 'Select…'}
            chipClassName={() => 'bg-field text-ink'}
          />
        )}
      </div>
    </div>
  )
}

function AxisModelTiles({
  axis,
  models,
  onChange,
}: {
  axis: XyAxisSettings
  models: ModelEntry[]
  onChange: (axis: XyAxisSettings) => void
}) {
  const style = useGenerateStore((s) => s.modelTileStyle)
  const spec = modelTileSpec(style)
  const [picker, setPicker] = useState<DOMRect | null>(null)
  const { dragProps } = useTileReorder(axis.values, (values) => onChange({ ...axis, values }))
  const galleryKind: keyof ModelLists =
    axis.type === 'lora' ? 'loras' : axis.type === 'vae' ? 'vae' : axis.type === 'text_encoder' ? 'text_encoders' : 'checkpoints'
  const chromeKey = axis.type === 'lora' ? 'loras' : axis.type === 'checkpoint' ? 'checkpoints' : 'other'
  const role = axis.type === 'lora' ? 'LoRA' : axis.type === 'vae' ? 'VAE' : axis.type === 'text_encoder' ? 'Text encoder' : 'Checkpoint'
  const view = useThumbView(galleryKind)
  const diffusionModels = useModelsStore((s) => s.diffusion_models)
  const diffusionPaths = useMemo(() => new Set(diffusionModels.map((item) => modelPath(item))), [diffusionModels])

  function itemKind(item: ModelEntry): keyof ModelLists {
    return diffusionPaths.has(modelPath(item)) ? 'diffusion_models' : 'checkpoints'
  }

  function toggle(path: string) {
    onChange({
      ...axis,
      values: axis.values.includes(path) ? axis.values.filter((entry) => entry !== path) : [...axis.values, path],
    })
  }

  return (
    <>
      <div className={['flex min-w-0 flex-wrap items-start', spec.gap].join(' ')}>
        {axis.values.map((path) => (
          <PickTile
            key={path}
            role={role}
            kind={galleryKind}
            items={models}
            itemKind={axis.type === 'checkpoint' ? itemKind : undefined}
            value={path}
            viewKind={
              axis.type === 'checkpoint' && diffusionPaths.has(path) ? 'diffusion_models' : galleryKind
            }
            view={view}
            chromeKey={chromeKey}
            onChange={toggle}
            onPick={setPicker}
            onClear={() => onChange({ ...axis, values: axis.values.filter((entry) => entry !== path) })}
            disabled={false}
            hideLabel
            drag={dragProps(path)}
          />
        ))}
        <PickTile
          role={role}
          kind={galleryKind}
          items={models}
          itemKind={axis.type === 'checkpoint' ? itemKind : undefined}
          value=""
          viewKind={galleryKind}
          view={view}
          chromeKey={chromeKey}
          onChange={toggle}
          onPick={setPicker}
          disabled={false}
          hideLabel
        />
      </div>
      {picker ? (
        <FloatingModelsView
          kind={galleryKind}
          items={models}
          itemKind={axis.type === 'checkpoint' ? itemKind : undefined}
          selected={axis.values}
          chromeKey={chromeKey}
          anchor={picker}
          closeOnSelect={false}
          onSelect={toggle}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </>
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
