import { OutputPathOverride } from './OutputPathOverride.tsx'
import { GenerationExtras } from './GenerationExtras.tsx'
import { GenerationScripts, type PromptMatrixSettings, type XyPlotSettings } from './GenerationScripts.tsx'
import { SliderField } from '@/components/primitives/SliderField.tsx'
import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { NumberField } from '@/components/primitives/NumberField.tsx'
import { SelectField } from '@/components/primitives/SelectField.tsx'
import { getKSamplerChoices } from '@/lib/api.ts'
import { useGenerateStore, SEED_AFTER, type SeedAfter } from '@/stores/generateStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useEffect, useState, type ReactNode } from 'react'
import { ASPECTS, SAMPLERS, SCHEDULERS, formatSize, inferScaler, listedChoices, orientSize, parseSize, sizeFromScaler, snapToSet, type ResMode } from './resolutions.ts'

function FieldLabel({ children }: { children: string }) {
  return <span className="text-xs text-muted">{children}</span>
}

function ParamSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className="shrink-0 text-xs text-label">{title}</h2>
        <div className="min-w-0 flex-1 border-t border-line" />
      </div>
      {children}
    </section>
  )
}

type GenerationParamsProps = {
  error: string | null
  warning?: string | null
  comfyOk: boolean
  lastSeed: number | null
  onPromptMatrix: (value: PromptMatrixSettings | null) => void
  onXyPlot: (value: XyPlotSettings | null) => void
  workflowParams: string[]
}

export function GenerationParams({
  error,
  warning,
  comfyOk,
  lastSeed,
  onPromptMatrix,
  onXyPlot,
  workflowParams,
}: GenerationParamsProps) {
  const width = useGenerateStore((s) => s.width)
  const height = useGenerateStore((s) => s.height)
  const steps = useGenerateStore((s) => s.steps)
  const cfg = useGenerateStore((s) => s.cfg)
  const seed = useGenerateStore((s) => s.seed)
  const seedAfter = useGenerateStore((s) => s.seedAfter)
  const batchSize = useGenerateStore((s) => s.batchSize)
  const batchCount = useGenerateStore((s) => s.batchCount)
  const sampler = useGenerateStore((s) => s.sampler)
  const scheduler = useGenerateStore((s) => s.scheduler)
  const resMode = useGenerateStore((s) => s.resMode)
  const aspect = useGenerateStore((s) => s.aspect)
  const megapixels = useGenerateStore((s) => s.megapixels)
  const setWidth = useGenerateStore((s) => s.setWidth)
  const setHeight = useGenerateStore((s) => s.setHeight)
  const setSteps = useGenerateStore((s) => s.setSteps)
  const setCfg = useGenerateStore((s) => s.setCfg)
  const setSeed = useGenerateStore((s) => s.setSeed)
  const setSeedAfter = useGenerateStore((s) => s.setSeedAfter)
  const setBatchSize = useGenerateStore((s) => s.setBatchSize)
  const setBatchCount = useGenerateStore((s) => s.setBatchCount)
  const setSampler = useGenerateStore((s) => s.setSampler)
  const setScheduler = useGenerateStore((s) => s.setScheduler)
  const setResMode = useGenerateStore((s) => s.setResMode)
  const setAspect = useGenerateStore((s) => s.setAspect)
  const setMegapixels = useGenerateStore((s) => s.setMegapixels)
  const outputImagePath = useGenerateStore((s) => s.outputImagePath)
  const outputGridPath = useGenerateStore((s) => s.outputGridPath)
  const outputImageName = useGenerateStore((s) => s.outputImageName)
  const outputGridName = useGenerateStore((s) => s.outputGridName)
  const outputPathEnabled = useGenerateStore((s) => s.outputPathEnabled)
  const setOutputImagePath = useGenerateStore((s) => s.setOutputImagePath)
  const setOutputGridPath = useGenerateStore((s) => s.setOutputGridPath)
  const setOutputImageName = useGenerateStore((s) => s.setOutputImageName)
  const setOutputGridName = useGenerateStore((s) => s.setOutputGridName)
  const setOutputPathEnabled = useGenerateStore((s) => s.setOutputPathEnabled)
  const hiddenSamplers = useSettingsStore((s) => s.hiddenSamplers)
  const hiddenSchedulers = useSettingsStore((s) => s.hiddenSchedulers)
  const setResolutions = useSettingsStore((s) => s.setResolutions)
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

  function onResMode(mode: ResMode) {
    if (mode === 'scaler') {
      const inferred = inferScaler(width, height)
      const size = sizeFromScaler(inferred.aspect, inferred.megapixels)
      setResMode('scaler')
      setAspect(inferred.aspect)
      setMegapixels(inferred.megapixels)
      setWidth(size.width)
      setHeight(size.height)
      return
    }
    if (mode === 'set') {
      const size = snapToSet(width, height, setResolutions)
      setResMode('set')
      setWidth(size.w)
      setHeight(size.h)
      return
    }
    setResMode('raw')
  }

  function onSetSize(key: string) {
    const size = parseSize(key)
    if (!size) {
      return
    }
    const next = orientSize(size, height > width)
    setWidth(next.w)
    setHeight(next.h)
  }

  function onOrient(vertical: boolean) {
    const next = orientSize({ w: width, h: height }, vertical)
    setWidth(next.w)
    setHeight(next.h)
  }

  function onAspect(id: string) {
    const size = sizeFromScaler(id, megapixels)
    setAspect(id)
    setWidth(size.width)
    setHeight(size.height)
  }

  function onMegapixels(value: number) {
    const size = sizeFromScaler(aspect, value)
    setMegapixels(value)
    setWidth(size.width)
    setHeight(size.height)
  }

  function swapSize() {
    setWidth(height)
    setHeight(width)
    const [aw, ah] = aspect.split(':')
    const flipped = `${ah}:${aw}`
    if (ASPECTS.some((item) => item.id === flipped)) {
      setAspect(flipped)
    }
  }

  return (
    <aside className="flex min-w-0 flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <FieldLabel>Sampler</FieldLabel>
          <SelectField value={sampler} onChange={setSampler} options={listedChoices(samplers, hiddenSamplers, sampler)} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <FieldLabel>Scheduler</FieldLabel>
          <SelectField
            value={scheduler}
            onChange={setScheduler}
            options={listedChoices(schedulers, hiddenSchedulers, scheduler)}
          />
        </div>
        <SliderField label="Steps" value={steps} onChange={setSteps} min={1} max={150} />
      </div>
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded border border-line text-xs">
          <button
            type="button"
            className={[
              'rounded-l px-2 py-1',
              resMode === 'raw' ? 'bg-line text-ink' : 'text-muted hover:text-ink',
            ].join(' ')}
            onClick={() => onResMode('raw')}
          >
            Raw
          </button>
          <button
            type="button"
            className={['px-2 py-1', resMode === 'scaler' ? 'bg-line text-ink' : 'text-muted hover:text-ink'].join(' ')}
            onClick={() => onResMode('scaler')}
          >
            Scaler
          </button>
          <button
            type="button"
            className={[
              'rounded-r px-2 py-1',
              resMode === 'set' ? 'bg-line text-ink' : 'text-muted hover:text-ink',
            ].join(' ')}
            onClick={() => onResMode('set')}
          >
            Set
          </button>
        </div>
        {resMode === 'scaler' ? <span className="text-xs text-muted">{width} × {height}</span> : null}
      </div>
      <div className="grid grid-cols-[minmax(0,70%)_auto_minmax(0,1fr)] items-center gap-2">
        <div className="flex min-w-0 flex-col gap-2">
          {resMode === 'raw' ? (
            <>
              <SliderField label="Width" value={width} onChange={setWidth} min={64} max={4096} step={8} />
              <SliderField label="Height" value={height} onChange={setHeight} min={64} max={4096} step={8} />
            </>
          ) : resMode === 'set' ? (
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex min-w-0 flex-col gap-1">
                <FieldLabel>Resolution</FieldLabel>
                <SelectField
                  value={formatSize({ w: Math.max(width, height), h: Math.min(width, height) })}
                  onChange={onSetSize}
                  options={[
                    ...new Set([
                      formatSize({ w: Math.max(width, height), h: Math.min(width, height) }),
                      ...setResolutions,
                    ]),
                  ].map((key) => {
                    const size = parseSize(key)
                    return {
                      value: key,
                      label: size ? formatSize(orientSize(size, height > width)) : key,
                    }
                  })}
                />
              </div>
              <div className="inline-flex self-start rounded border border-line text-xs">
                <button
                  type="button"
                  className={[
                    'rounded-l px-2 py-1',
                    height <= width ? 'bg-line text-ink' : 'text-muted hover:text-ink',
                  ].join(' ')}
                  onClick={() => onOrient(false)}
                >
                  Horizontal
                </button>
                <button
                  type="button"
                  className={[
                    'rounded-r px-2 py-1',
                    height > width ? 'bg-line text-ink' : 'text-muted hover:text-ink',
                  ].join(' ')}
                  onClick={() => onOrient(true)}
                >
                  Vertical
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex min-w-0 flex-col gap-1">
                <FieldLabel>Aspect</FieldLabel>
                <SelectField
                  value={aspect}
                  onChange={onAspect}
                  options={ASPECTS.map((item) => ({ value: item.id, label: item.label }))}
                />
              </div>
              <SliderField label="Megapixels" value={megapixels} onChange={onMegapixels} min={0.2} max={4} step={0.05} />
            </>
          )}
        </div>
        <button type="button" className="icon-btn" aria-label="Swap width and height" onClick={swapSize}>
          <AppIcon id="arrow-up-down" />
        </button>
        <div className="flex min-w-0 flex-col gap-2">
          <SliderField label="Batch count" value={batchCount} onChange={setBatchCount} min={1} max={100} />
          <SliderField label="Batch size" value={batchSize} onChange={setBatchSize} min={1} max={8} />
        </div>
      </div>
      <SliderField label="CFG" value={cfg} onChange={setCfg} min={1} max={30} step={0.5} />
      <div className="flex items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs text-muted">Seed</span>
          <NumberField value={seed} onChange={setSeed} />
        </label>
        <div className="flex w-32 shrink-0 flex-col gap-1">
          <FieldLabel>After generation</FieldLabel>
          <SelectField
            value={seedAfter}
            onChange={(value) => setSeedAfter(value as SeedAfter, lastSeed)}
            options={[...SEED_AFTER]}
          />
        </div>
      </div>
      <ParamSection title="Extras">
        <GenerationExtras />
      </ParamSection>
      <ParamSection title="Other">
        <OutputPathOverride
          imagePath={outputImagePath}
          gridPath={outputGridPath}
          imageName={outputImageName}
          gridName={outputGridName}
          enabled={outputPathEnabled}
          onImagePath={setOutputImagePath}
          onGridPath={setOutputGridPath}
          onImageName={setOutputImageName}
          onGridName={setOutputGridName}
          onEnabled={setOutputPathEnabled}
        />
        <GenerationScripts
          onPromptMatrix={onPromptMatrix}
          onXyPlot={onXyPlot}
          workflowParams={workflowParams}
          comfyOk={comfyOk}
        />
      </ParamSection>
      {error ? <p className="text-xs text-accent">{error}</p> : null}
      {warning ? <p className="text-xs text-muted">{warning}</p> : null}
    </aside>
  )
}
