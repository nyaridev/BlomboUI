import { CheckRow } from '@/components/controls/check-row/CheckRow.tsx'
import { CheckboxControl } from '@/components/controls/toggle/CheckboxControl.tsx'
import { ExpandSection } from '@/components/controls/expand-section/ExpandSection.tsx'
import { ModelPickTile } from '@/components/composites/models/ModelPickTile.tsx'
import { NumberField } from '@/components/controls/number/NumberField.tsx'
import { SelectField } from '@/components/controls/select/SelectField.tsx'
import { SliderField } from '@/components/controls/slider/SliderField.tsx'
import { getSeedvr2Models } from '@/lib/api.ts'
import { SEED_AFTER, type ImageUpscaleSettings, type SeedAfter, useGenerateStore } from '@/stores/generateStore.ts'
import { ParamSection } from '@/views/generate/panels/generation/sections/params/ParamSection.tsx'
import { ImageUpscaleSize } from '@/views/generate/panels/generation/sections/params/ImageUpscaleSize.tsx'
import { IMAGE_SCALE_CROPS, IMAGE_SCALE_METHODS } from '@/views/generate/panels/generation/sections/params/resolutions.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useEffect, useState } from 'react'

const BOX = 'rounded-md border border-line bg-panel p-2.5'
const COLOR = ['lab', 'none', 'wavelet']
const DEVICES = ['cuda:0', 'cpu']
const ATTENTION = ['sdpa']
const COMPILE_BACKEND = ['inductor']
const COMPILE_MODE = ['default', 'reduce-overhead', 'max-autotune']

function withCurrent(current: string, listed: string[]) {
  return [...new Set([current, ...listed].filter(Boolean))]
}

export function ImageUpscaleFields({
  value,
  files,
  onChange,
  lastSeed = null,
}: {
  value: ImageUpscaleSettings
  files: File[]
  onChange: (next: Partial<ImageUpscaleSettings>) => void
  lastSeed?: number | null
}) {
  const setResolutions = useSettingsStore((s) => s.setResolutions)
  const seed = useGenerateStore((s) => s.seed)
  const seedAfter = useGenerateStore((s) => s.seedAfter)
  const setSeed = useGenerateStore((s) => s.setSeed)
  const setSeedAfter = useGenerateStore((s) => s.setSeedAfter)
  const [source, setSource] = useState({ w: 512, h: 512 })
  const [seedvr2Models, setSeedvr2Models] = useState<string[]>([])
  const seedvr2 = value.engine === 'seedvr2'

  useEffect(() => {
    const file = files[0]
    if (!file) {
      return
    }
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      setSource({ w: image.naturalWidth || 512, h: image.naturalHeight || 512 })
      URL.revokeObjectURL(url)
    }
    image.onerror = () => URL.revokeObjectURL(url)
    image.src = url
    return () => URL.revokeObjectURL(url)
  }, [files])

  useEffect(() => {
    if (!seedvr2) {
      return
    }
    void getSeedvr2Models()
      .then(setSeedvr2Models)
      .catch(() => setSeedvr2Models([]))
  }, [seedvr2])

  const sizeBlock = <ImageUpscaleSize value={value} source={source} setResolutions={setResolutions} onChange={onChange} />

  return (
    <div className="flex flex-col gap-stack">
      {seedvr2 ? null : (
        <div className="flex justify-center">
          <div className="flex flex-col items-center gap-0.5">
            <span className="truncate px-0.5 text-[10px] uppercase tracking-wide text-muted">Upscale</span>
            <ModelPickTile
              kind="upscale_models"
              role="Upscale"
              size="tall"
              chromeKey="generate-upscale"
              value={value.upscaleModel}
              onChange={(upscaleModel) => onChange({ upscaleModel })}
              onClear={() => onChange({ upscaleModel: '' })}
            />
          </div>
        </div>
      )}
      <ParamSection title="Params">
        <div className="flex flex-col gap-stack">
          {sizeBlock}
          {seedvr2 ? (
            <>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-xs text-muted">Color correction</span>
                <SelectField
                  value={COLOR.includes(value.colorCorrection) ? value.colorCorrection : COLOR[0]}
                  onChange={(colorCorrection) => onChange({ colorCorrection })}
                  options={COLOR}
                />
              </div>
              <div className="grid grid-cols-2 gap-stack">
                <SliderField
                  label="Input noise"
                  value={value.inputNoiseScale}
                  onChange={(inputNoiseScale) => onChange({ inputNoiseScale })}
                  min={0}
                  max={1}
                  step={0.01}
                />
                <SliderField
                  label="Latent noise"
                  value={value.latentNoiseScale}
                  onChange={(latentNoiseScale) => onChange({ latentNoiseScale })}
                  min={0}
                  max={1}
                  step={0.01}
                />
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-stack">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-xs text-muted">Method</span>
                <SelectField
                  value={value.upscaleMethod}
                  onChange={(upscaleMethod) => onChange({ upscaleMethod })}
                  options={[...IMAGE_SCALE_METHODS]}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-xs text-muted">Crop</span>
                <SelectField value={value.crop} onChange={(crop) => onChange({ crop })} options={[...IMAGE_SCALE_CROPS]} />
              </div>
            </div>
          )}
        </div>
      </ParamSection>
      <div className="flex items-end gap-stack">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs text-muted">Seed</span>
          <NumberField value={seed} onChange={setSeed} />
        </label>
        <div className="flex w-32 shrink-0 flex-col gap-1">
          <span className="text-xs text-muted">After generation</span>
          <SelectField
            value={seedAfter}
            onChange={(next) => setSeedAfter(next as SeedAfter, lastSeed)}
            options={[...SEED_AFTER]}
          />
        </div>
      </div>
      {seedvr2 ? (
        <ExpandSection title="Advanced" fit>
          <div className="flex flex-col gap-stack">
            <CheckRow on={value.maxResolutionOverride} onChange={(maxResolutionOverride) => onChange({ maxResolutionOverride })}>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-xs text-muted">Max resolution</span>
                <NumberField
                  value={value.maxResolution}
                  onChange={(maxResolution) => onChange({ maxResolution: Math.round(maxResolution) })}
                  min={64}
                  max={8192}
                  step={8}
                />
              </div>
            </CheckRow>
            <SliderField label="Temporal overlap" value={value.temporalOverlap} onChange={(temporalOverlap) => onChange({ temporalOverlap })} min={0} max={16} step={1} />
            <SliderField label="Prepend frames" value={value.prependFrames} onChange={(prependFrames) => onChange({ prependFrames })} min={0} max={16} step={1} />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">Offload device</span>
              <SelectField value={value.offloadDevice} onChange={(offloadDevice) => onChange({ offloadDevice })} options={DEVICES} />
            </div>
            <label className={`${BOX} flex min-w-0 items-center gap-2 text-sm text-ink`}>
              <CheckboxControl checked={value.enableDebug} onChange={(enableDebug) => onChange({ enableDebug })} />
              Debug
            </label>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">DiT model</span>
              <SelectField
                value={value.ditModel}
                onChange={(ditModel) => onChange({ ditModel })}
                options={withCurrent(value.ditModel, seedvr2Models)}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">DiT device</span>
              <SelectField value={value.ditDevice} onChange={(ditDevice) => onChange({ ditDevice })} options={DEVICES} />
            </div>
            <SliderField label="Blocks to swap" value={value.blocksToSwap} onChange={(blocksToSwap) => onChange({ blocksToSwap })} min={0} max={48} step={1} />
            <label className={`${BOX} flex min-w-0 items-center gap-2 text-sm text-ink`}>
              <CheckboxControl checked={value.swapIoComponents} onChange={(swapIoComponents) => onChange({ swapIoComponents })} />
              Swap I/O components
            </label>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">DiT offload</span>
              <SelectField
                value={value.ditOffloadDevice}
                onChange={(ditOffloadDevice) => onChange({ ditOffloadDevice })}
                options={DEVICES}
              />
            </div>
            <label className={`${BOX} flex min-w-0 items-center gap-2 text-sm text-ink`}>
              <CheckboxControl checked={value.ditCacheModel} onChange={(ditCacheModel) => onChange({ ditCacheModel })} />
              Cache DiT
            </label>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">Attention</span>
              <SelectField value={value.attentionMode} onChange={(attentionMode) => onChange({ attentionMode })} options={ATTENTION} />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">VAE model</span>
              <SelectField
                value={value.vaeModel}
                onChange={(vaeModel) => onChange({ vaeModel })}
                options={withCurrent(value.vaeModel, seedvr2Models)}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">VAE device</span>
              <SelectField value={value.vaeDevice} onChange={(vaeDevice) => onChange({ vaeDevice })} options={DEVICES} />
            </div>
            <label className={`${BOX} flex min-w-0 items-center gap-2 text-sm text-ink`}>
              <CheckboxControl checked={value.encodeTiled} onChange={(encodeTiled) => onChange({ encodeTiled })} />
              Encode tiled
            </label>
            <SliderField label="Encode tile" value={value.encodeTileSize} onChange={(encodeTileSize) => onChange({ encodeTileSize })} min={64} max={2048} step={64} />
            <SliderField
              label="Encode overlap"
              value={value.encodeTileOverlap}
              onChange={(encodeTileOverlap) => onChange({ encodeTileOverlap })}
              min={0}
              max={512}
              step={8}
            />
            <label className={`${BOX} flex min-w-0 items-center gap-2 text-sm text-ink`}>
              <CheckboxControl checked={value.decodeTiled} onChange={(decodeTiled) => onChange({ decodeTiled })} />
              Decode tiled
            </label>
            <SliderField label="Decode tile" value={value.decodeTileSize} onChange={(decodeTileSize) => onChange({ decodeTileSize })} min={64} max={2048} step={64} />
            <SliderField
              label="Decode overlap"
              value={value.decodeTileOverlap}
              onChange={(decodeTileOverlap) => onChange({ decodeTileOverlap })}
              min={0}
              max={512}
              step={8}
            />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">VAE offload</span>
              <SelectField
                value={value.vaeOffloadDevice}
                onChange={(vaeOffloadDevice) => onChange({ vaeOffloadDevice })}
                options={DEVICES}
              />
            </div>
            <label className={`${BOX} flex min-w-0 items-center gap-2 text-sm text-ink`}>
              <CheckboxControl checked={value.vaeCacheModel} onChange={(vaeCacheModel) => onChange({ vaeCacheModel })} />
              Cache VAE
            </label>
            <label className={`${BOX} flex min-w-0 items-center gap-2 text-sm text-ink`}>
              <CheckboxControl checked={value.allowCompile} onChange={(allowCompile) => onChange({ allowCompile })} />
              Allow torch compile
            </label>
            {value.allowCompile ? (
              <>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs text-muted">Backend</span>
                  <SelectField
                    value={value.compileBackend}
                    onChange={(compileBackend) => onChange({ compileBackend })}
                    options={COMPILE_BACKEND}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs text-muted">Mode</span>
                  <SelectField value={value.compileMode} onChange={(compileMode) => onChange({ compileMode })} options={COMPILE_MODE} />
                </div>
                <label className={`${BOX} flex min-w-0 items-center gap-2 text-sm text-ink`}>
                  <CheckboxControl checked={value.compileFullgraph} onChange={(compileFullgraph) => onChange({ compileFullgraph })} />
                  Fullgraph
                </label>
                <label className={`${BOX} flex min-w-0 items-center gap-2 text-sm text-ink`}>
                  <CheckboxControl checked={value.compileDynamic} onChange={(compileDynamic) => onChange({ compileDynamic })} />
                  Dynamic
                </label>
                <SliderField
                  label="Dynamo cache"
                  value={value.dynamoCacheSizeLimit}
                  onChange={(dynamoCacheSizeLimit) => onChange({ dynamoCacheSizeLimit })}
                  min={1}
                  max={256}
                  step={1}
                />
                <SliderField
                  label="Recompile limit"
                  value={value.dynamoRecompileLimit}
                  onChange={(dynamoRecompileLimit) => onChange({ dynamoRecompileLimit })}
                  min={1}
                  max={512}
                  step={1}
                />
              </>
            ) : null}
          </div>
        </ExpandSection>
      ) : null}
    </div>
  )
}
