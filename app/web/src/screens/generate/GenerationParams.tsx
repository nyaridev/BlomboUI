import { SliderField } from '@/components/SliderField.tsx'
import { NumberField } from '@/components/NumberField.tsx'
import { SelectField } from '@/components/SelectField.tsx'
import { getKSamplerChoices } from '@/lib/api.ts'
import { useGenerateStore } from '@/stores/generateStore.ts'
import { useEffect, useState } from 'react'
import { ASPECTS, SAMPLERS, SCHEDULERS, inferScaler, sizeFromScaler } from './resolutions.ts'

function FieldLabel({ children }: { children: string }) {
  return <span className="text-xs text-muted">{children}</span>
}

type GenerationParamsProps = {
  error: string | null
  comfyOk: boolean
  lastSeed: number | null
}

export function GenerationParams({ error, comfyOk, lastSeed }: GenerationParamsProps) {
  const width = useGenerateStore((s) => s.width)
  const height = useGenerateStore((s) => s.height)
  const steps = useGenerateStore((s) => s.steps)
  const cfg = useGenerateStore((s) => s.cfg)
  const seed = useGenerateStore((s) => s.seed)
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
  const setBatchSize = useGenerateStore((s) => s.setBatchSize)
  const setBatchCount = useGenerateStore((s) => s.setBatchCount)
  const setSampler = useGenerateStore((s) => s.setSampler)
  const setScheduler = useGenerateStore((s) => s.setScheduler)
  const setResMode = useGenerateStore((s) => s.setResMode)
  const setAspect = useGenerateStore((s) => s.setAspect)
  const setMegapixels = useGenerateStore((s) => s.setMegapixels)
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

  function onResMode(mode: 'raw' | 'scaler') {
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
    setResMode('raw')
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
    <aside className="flex min-w-0 flex-[3] flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <FieldLabel>Sampler</FieldLabel>
          <SelectField value={sampler} onChange={setSampler} options={[...new Set([sampler, ...samplers])]} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <FieldLabel>Scheduler</FieldLabel>
          <SelectField
            value={scheduler}
            onChange={setScheduler}
            options={[...new Set([scheduler, ...schedulers])]}
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
            className={[
              'rounded-r px-2 py-1',
              resMode === 'scaler' ? 'bg-line text-ink' : 'text-muted hover:text-ink',
            ].join(' ')}
            onClick={() => onResMode('scaler')}
          >
            Scaler
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
          ⇅
        </button>
        <div className="flex min-w-0 flex-col gap-2">
          <SliderField label="Batch count" value={batchCount} onChange={setBatchCount} min={1} max={100} />
          <SliderField label="Batch size" value={batchSize} onChange={setBatchSize} min={1} max={8} />
        </div>
      </div>
      <SliderField label="CFG" value={cfg} onChange={setCfg} min={1} max={30} step={0.5} />
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">Seed</span>
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <NumberField value={seed} onChange={setSeed} />
          </div>
          <button type="button" className="icon-btn" aria-label="Random seed" onClick={() => setSeed(-1)}>
            🎲
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Restore last seed"
            disabled={lastSeed == null}
            onClick={() => lastSeed != null && setSeed(lastSeed)}
          >
            ↩
          </button>
        </div>
      </label>
      {error ? <p className="text-xs text-accent">{error}</p> : null}
    </aside>
  )
}
