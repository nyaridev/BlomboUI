import { OutputPathOverride } from '@/views/generate/panels/generation/sections/params/OutputPathOverride.tsx'
import { GenerationExtras } from '@/views/generate/panels/generation/sections/params/GenerationExtras.tsx'
import { GenerationScripts } from '@/views/generate/panels/generation/sections/params/GenerationScripts.tsx'
import { NumberField } from '@/components/controls/number/NumberField.tsx'
import { SelectField } from '@/components/controls/select/SelectField.tsx'
import { ButtonControl } from '@/components/controls/button/ButtonControl.tsx'
import { ApplyRow, TemplateModelFields } from '@/components/composites/templates/TemplateModelFields.tsx'
import { PromptField } from '@/views/generate/panels/chrome/sections/prompt/PromptSuggest.tsx'
import { templateApplyFields, type TemplateParams, SEED_AFTER, type SeedAfter } from '@/stores/generateStore.ts'
import { ASPECTS, SAMPLERS, SCHEDULERS, formatSize, listedChoices, orientSize, parseSize, snapToSet } from '@/views/generate/panels/generation/sections/params/resolutions.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import type { ReactNode } from 'react'

function Label({ children }: { children: string }) {
  return <span className="text-xs text-muted">{children}</span>
}

function ParamSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-stack">
      <div className="flex items-center gap-2">
        <h2 className="shrink-0 text-xs text-label">{title}</h2>
        <div className="min-w-0 flex-1 border-t border-line" />
      </div>
      {children}
    </section>
  )
}

type TemplateParamsFormProps = {
  value: TemplateParams
  onChange: (value: TemplateParams) => void
  apply: string[]
  onApplyChange: (apply: string[]) => void
  locked?: boolean
  workflowParams?: string[]
}

export function TemplateParamsForm({
  value,
  onChange,
  apply,
  onApplyChange,
  locked = false,
  workflowParams = [],
}: TemplateParamsFormProps) {
  const hiddenSamplers = useSettingsStore((s) => s.hiddenSamplers)
  const hiddenSchedulers = useSettingsStore((s) => s.hiddenSchedulers)
  const setResolutions = useSettingsStore((s) => s.setResolutions)
  const visibleApply = templateApplyFields(workflowParams)
  const visibleIds = new Set<string>(visibleApply.map((field) => field.id))
  const none = visibleApply.every((field) => !apply.includes(field.id))
  function set<K extends keyof TemplateParams>(key: K, next: TemplateParams[K]) {
    if (locked) {
      return
    }
    onChange({ ...value, [key]: next })
  }
  function toggle(id: string) {
    onApplyChange(apply.includes(id) ? apply.filter((item) => item !== id) : [...apply, id])
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-stack">
      <div className="flex justify-end">
        <ButtonControl
          size="sm"
          tone="ghost"
          onClick={() =>
            onApplyChange(
              none
                ? [...apply.filter((id) => !visibleIds.has(id)), ...visibleApply.map((field) => field.id)]
                : apply.filter((id) => !visibleIds.has(id)),
            )
          }
        >
          {none ? 'Select all' : 'Deselect all'}
        </ButtonControl>
      </div>
      <div className="rounded-md border border-line bg-panel p-2.5">
        <TemplateModelFields
          value={value}
          onChange={onChange}
          apply={apply}
          onToggle={toggle}
          locked={locked}
          workflowParams={workflowParams}
        />
      </div>
      <ParamSection title="Prompt">
        <ApplyRow id="prompt" apply={apply} onToggle={toggle} locked={locked}>
          <label className="flex flex-col gap-1">
            <Label>Prompt</Label>
            <div className="relative h-24 min-h-20">
              <PromptField
                value={value.prompt}
                onChange={(prompt) => set('prompt', prompt)}
                placeholder="Positive"
                side="prompt"
                disabled={locked}
                checkpoint={value.checkpoint}
                companionNegative={value.negativePrompt}
                onCompanionNegative={(negativePrompt) => set('negativePrompt', negativePrompt)}
              />
            </div>
          </label>
        </ApplyRow>
        <ApplyRow id="negativePrompt" apply={apply} onToggle={toggle} locked={locked}>
          <label className="flex flex-col gap-1">
            <Label>Negative</Label>
            <div className="relative h-20 min-h-16">
              <PromptField
                value={value.negativePrompt}
                onChange={(negativePrompt) => set('negativePrompt', negativePrompt)}
                placeholder="Negative"
                side="negative"
                disabled={locked || value.cfg <= 1}
                checkpoint={value.checkpoint}
              />
            </div>
          </label>
        </ApplyRow>
      </ParamSection>
      <ParamSection title="Sampler">
        <div className="grid grid-cols-2 gap-stack">
          <ApplyRow id="sampler" apply={apply} onToggle={toggle} locked={locked}>
            <div className="flex min-w-0 flex-col gap-1">
              <Label>Sampler</Label>
              <SelectField
                value={value.sampler}
                onChange={(sampler) => set('sampler', sampler)}
                options={listedChoices(SAMPLERS, hiddenSamplers, value.sampler)}
              />
            </div>
          </ApplyRow>
          <ApplyRow id="scheduler" apply={apply} onToggle={toggle} locked={locked}>
            <div className="flex min-w-0 flex-col gap-1">
              <Label>Scheduler</Label>
              <SelectField
                value={value.scheduler}
                onChange={(scheduler) => set('scheduler', scheduler)}
                options={listedChoices(SCHEDULERS, hiddenSchedulers, value.scheduler)}
              />
            </div>
          </ApplyRow>
        </div>
        <div className="grid grid-cols-2 gap-stack">
          <ApplyRow id="steps" apply={apply} onToggle={toggle} locked={locked}>
            <label className="flex min-w-0 flex-col gap-1">
              <Label>Steps</Label>
              <NumberField value={value.steps} onChange={(steps) => set('steps', steps)} min={1} max={150} />
            </label>
          </ApplyRow>
          <ApplyRow id="cfg" apply={apply} onToggle={toggle} locked={locked}>
            <label className="flex min-w-0 flex-col gap-1">
              <Label>CFG</Label>
              <NumberField value={value.cfg} onChange={(cfg) => set('cfg', Math.max(1, cfg))} min={1} max={30} step={0.5} />
            </label>
          </ApplyRow>
        </div>
      </ParamSection>
      <ParamSection title="Seed">
        <ApplyRow id="seed" apply={apply} onToggle={toggle} locked={locked}>
          <div className="flex items-end gap-stack">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <Label>Seed</Label>
              <NumberField value={value.seed} onChange={(seed) => set('seed', seed)} />
            </label>
            <div className="flex w-32 shrink-0 flex-col gap-1">
              <Label>After generation</Label>
              <SelectField
                value={value.seedAfter}
                onChange={(mode) => {
                  if (locked) {
                    return
                  }
                  const seedAfter = mode as SeedAfter
                  onChange({ ...value, seedAfter, seed: seedAfter === 'randomize' ? -1 : value.seed })
                }}
                options={[...SEED_AFTER]}
              />
            </div>
          </div>
        </ApplyRow>
      </ParamSection>
      <ParamSection title="Size">
        <ApplyRow id="resolution" apply={apply} onToggle={toggle} locked={locked}>
          <div className="flex flex-col gap-stack">
            <div className="inline-flex self-start rounded border border-line text-xs">
              <button
                type="button"
                className={['rounded-l px-2 py-1', value.resMode === 'raw' ? 'bg-line text-ink' : 'text-muted hover:text-ink'].join(' ')}
                onClick={() => set('resMode', 'raw')}
              >
                Raw
              </button>
              <button
                type="button"
                className={['px-2 py-1', value.resMode === 'scaler' ? 'bg-line text-ink' : 'text-muted hover:text-ink'].join(' ')}
                onClick={() => set('resMode', 'scaler')}
              >
                Scaler
              </button>
              <button
                type="button"
                className={['rounded-r px-2 py-1', value.resMode === 'set' ? 'bg-line text-ink' : 'text-muted hover:text-ink'].join(' ')}
                onClick={() => {
                  if (locked) {
                    return
                  }
                  const size = snapToSet(value.width, value.height, setResolutions)
                  onChange({ ...value, resMode: 'set', width: size.w, height: size.h })
                }}
              >
                Set
              </button>
            </div>
            {value.resMode === 'raw' ? (
              <div className="grid grid-cols-2 gap-stack">
                <label className="flex min-w-0 flex-col gap-1">
                  <Label>Width</Label>
                  <NumberField value={value.width} onChange={(width) => set('width', width)} min={64} max={4096} step={8} />
                </label>
                <label className="flex min-w-0 flex-col gap-1">
                  <Label>Height</Label>
                  <NumberField value={value.height} onChange={(height) => set('height', height)} min={64} max={4096} step={8} />
                </label>
              </div>
            ) : value.resMode === 'set' ? (
              <div className="flex min-w-0 flex-col gap-stack">
                <div className="flex min-w-0 flex-col gap-1">
                  <Label>Resolution</Label>
                  <SelectField
                    value={formatSize({ w: Math.max(value.width, value.height), h: Math.min(value.width, value.height) })}
                    onChange={(key) => {
                      if (locked) {
                        return
                      }
                      const size = parseSize(key)
                      if (!size) {
                        return
                      }
                      const next = orientSize(size, value.height > value.width)
                      onChange({ ...value, width: next.w, height: next.h })
                    }}
                    options={[
                      ...new Set([
                        formatSize({ w: Math.max(value.width, value.height), h: Math.min(value.width, value.height) }),
                        ...setResolutions,
                      ]),
                    ].map((key) => {
                      const size = parseSize(key)
                      return {
                        value: key,
                        label: size ? formatSize(orientSize(size, value.height > value.width)) : key,
                      }
                    })}
                  />
                </div>
                <div className="inline-flex self-start rounded border border-line text-xs">
                  <button
                    type="button"
                    className={[
                      'rounded-l px-2 py-1',
                      value.height <= value.width ? 'bg-line text-ink' : 'text-muted hover:text-ink',
                    ].join(' ')}
                    onClick={() => {
                      if (locked) {
                        return
                      }
                      const size = orientSize({ w: value.width, h: value.height }, false)
                      onChange({ ...value, width: size.w, height: size.h })
                    }}
                  >
                    Horizontal
                  </button>
                  <button
                    type="button"
                    className={[
                      'rounded-r px-2 py-1',
                      value.height > value.width ? 'bg-line text-ink' : 'text-muted hover:text-ink',
                    ].join(' ')}
                    onClick={() => {
                      if (locked) {
                        return
                      }
                      const size = orientSize({ w: value.width, h: value.height }, true)
                      onChange({ ...value, width: size.w, height: size.h })
                    }}
                  >
                    Vertical
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-stack">
                <div className="flex min-w-0 flex-col gap-1">
                  <Label>Aspect</Label>
                  <SelectField
                    value={value.aspect}
                    onChange={(aspect) => set('aspect', aspect)}
                    options={ASPECTS.map((item) => ({ value: item.id, label: item.label }))}
                  />
                </div>
                <label className="flex min-w-0 flex-col gap-1">
                  <Label>Megapixels</Label>
                  <NumberField
                    value={value.megapixels}
                    onChange={(megapixels) => set('megapixels', megapixels)}
                    min={0.2}
                    max={4}
                    step={0.05}
                  />
                </label>
              </div>
            )}
          </div>
        </ApplyRow>
        <div className="grid grid-cols-2 gap-stack">
          <ApplyRow id="batchCount" apply={apply} onToggle={toggle} locked={locked}>
            <label className="flex min-w-0 flex-col gap-1">
              <Label>Batch count</Label>
              <NumberField value={value.batchCount} onChange={(batchCount) => set('batchCount', batchCount)} min={1} max={100} />
            </label>
          </ApplyRow>
          <ApplyRow id="batchSize" apply={apply} onToggle={toggle} locked={locked}>
            <label className="flex min-w-0 flex-col gap-1">
              <Label>Batch size</Label>
              <NumberField value={value.batchSize} onChange={(batchSize) => set('batchSize', batchSize)} min={1} max={8} />
            </label>
          </ApplyRow>
        </div>
      </ParamSection>
      <ParamSection title="Output">
        <ApplyRow id="outputPath" apply={apply} onToggle={toggle} locked={locked}>
          <OutputPathOverride
            imagePath={value.outputImagePath}
            gridPath={value.outputGridPath}
            imageName={value.outputImageName}
            gridName={value.outputGridName}
            hiresPath={value.outputHiresPath}
            hiresName={value.outputHiresName}
            enabled={value.outputPathEnabled}
            onImagePath={(outputImagePath) => set('outputImagePath', outputImagePath)}
            onGridPath={(outputGridPath) => set('outputGridPath', outputGridPath)}
            onImageName={(outputImageName) => set('outputImageName', outputImageName)}
            onGridName={(outputGridName) => set('outputGridName', outputGridName)}
            onHiresPath={(outputHiresPath) => set('outputHiresPath', outputHiresPath)}
            onHiresName={(outputHiresName) => set('outputHiresName', outputHiresName)}
            onEnabled={(outputPathEnabled) => set('outputPathEnabled', outputPathEnabled)}
          />
        </ApplyRow>
      </ParamSection>
      <ParamSection title="Extras">
        <ApplyRow id="hires" apply={apply} onToggle={toggle} locked={locked}>
          <GenerationExtras
            value={{ hires: value.hires, adetailer: value.adetailer, controlnet: value.controlnet }}
            onChange={(patch) => onChange({ ...value, ...patch })}
            locked={locked}
            only="hires"
            workflowParams={workflowParams}
            comfyOk
            width={value.width}
            height={value.height}
          />
        </ApplyRow>
        <ApplyRow id="adetailer" apply={apply} onToggle={toggle} locked={locked}>
          <GenerationExtras
            value={{ hires: value.hires, adetailer: value.adetailer, controlnet: value.controlnet }}
            onChange={(patch) => onChange({ ...value, ...patch })}
            locked={locked}
            only="adetailer"
          />
        </ApplyRow>
        <ApplyRow id="controlnet" apply={apply} onToggle={toggle} locked={locked}>
          <GenerationExtras
            value={{ hires: value.hires, adetailer: value.adetailer, controlnet: value.controlnet }}
            onChange={(patch) => onChange({ ...value, ...patch })}
            locked={locked}
            only="controlnet"
          />
        </ApplyRow>
      </ParamSection>
      <ParamSection title="Scripts">
        <ApplyRow id="scripts" apply={apply} onToggle={toggle} locked={locked}>
          <GenerationScripts
            value={{ script: value.script, promptMatrix: value.promptMatrix, xyPlot: value.xyPlot }}
            onChange={(next) => onChange({ ...value, ...next })}
            locked={locked}
            workflowParams={workflowParams}
            comfyOk
          />
        </ApplyRow>
      </ParamSection>
    </div>
  )
}
