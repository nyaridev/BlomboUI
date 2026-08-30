import { CheckboxControl } from '@/components/controls/toggle/CheckboxControl.tsx'
import { ExpandSection } from '@/components/controls/expand-section/ExpandSection.tsx'
import { ModelPickTile } from '@/components/composites/models/ModelPickTile.tsx'
import { SegmentSwitch } from '@/components/controls/button/SegmentSwitch.tsx'
import { NumberField } from '@/components/controls/number/NumberField.tsx'
import { SelectField } from '@/components/controls/select/SelectField.tsx'
import { SliderField } from '@/components/controls/slider/SliderField.tsx'
import { getSeedvr2Models } from '@/lib/api.ts'
import { SEED_AFTER, SEED_U32_MAX, wrapSeed32, type ImageUpscaleSettings, type SeedAfter } from '@/stores/generateStore.ts'
import { ParamSection } from '@/views/generate/panels/generation/sections/params/ParamSection.tsx'
import { ImageUpscaleSize } from '@/views/generate/panels/generation/sections/params/ImageUpscaleSize.tsx'
import { IMAGE_SCALE_CROPS, IMAGE_SCALE_METHODS } from '@/views/generate/panels/generation/sections/params/resolutions.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useEffect, useState, type ReactNode } from 'react'

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
  selectedIndex = 0,
  onChange,
  lastSeed = null,
  flushModels = false,
  wrap,
}: {
  value: ImageUpscaleSettings
  files: File[]
  selectedIndex?: number
  onChange: (next: Partial<ImageUpscaleSettings>) => void
  lastSeed?: number | null
  flushModels?: boolean
  wrap?: (id: string, node: ReactNode) => ReactNode
}) {
  const setResolutions = useSettingsStore((s) => s.setResolutions)
  const [source, setSource] = useState({ w: 512, h: 512 })
  const [seedvr2Models, setSeedvr2Models] = useState<string[]>([])
  const seedvr2 = value.engine === 'seedvr2'

  useEffect(() => {
    const file = files[selectedIndex] ?? files[0]
    if (!file) {
      setSource({ w: 512, h: 512 })
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
  }, [files, selectedIndex])

  useEffect(() => {
    if (!seedvr2) {
      return
    }
    void getSeedvr2Models()
      .then(setSeedvr2Models)
      .catch(() => setSeedvr2Models([]))
  }, [seedvr2])

  const sizeBlock = <ImageUpscaleSize value={value} source={source} setResolutions={setResolutions} onChange={onChange} />
  function box(id: string, node: ReactNode) {
    return wrap ? wrap(id, node) : node
  }

  return (
    <div className="flex min-w-0 w-full flex-col gap-stack">
      <ParamSection title="Models" spaced={!flushModels}>
        <div className="flex flex-col gap-stack">
          {box(
            'upscaleEngine',
            <SegmentSwitch
              fill
              value={value.engine}
              tone="blue"
              options={[
                { id: 'model', label: 'Upscale model' },
                { id: 'seedvr2', label: 'SeedVR2' },
              ]}
              onChange={(engine) => onChange({ engine })}
            />,
          )}
          {seedvr2 ? (
            <div className="grid grid-cols-2 gap-stack">
              {box(
                'upscaleDitModel',
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs text-muted">DiT model</span>
                  <SelectField
                    value={value.ditModel}
                    onChange={(ditModel) => onChange({ ditModel })}
                    options={withCurrent(value.ditModel, seedvr2Models)}
                  />
                </div>,
              )}
              {box(
                'upscaleVaeModel',
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs text-muted">VAE model</span>
                  <SelectField
                    value={value.vaeModel}
                    onChange={(vaeModel) => onChange({ vaeModel })}
                    options={withCurrent(value.vaeModel, seedvr2Models)}
                  />
                </div>,
              )}
            </div>
          ) : (
            box(
              'upscaleModel',
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
              </div>,
            )
          )}
        </div>
      </ParamSection>
      <ParamSection title="Params">
        <div className="flex flex-col gap-stack">
          {seedvr2 ? (
            <>
              <div className="grid grid-cols-2 gap-stack">
                {box(
                  'upscaleResolution',
                  <SliderField
                    label="Resolution"
                    value={value.resolution}
                    onChange={(resolution) => onChange({ resolution: Math.round(resolution) })}
                    min={64}
                    max={8192}
                    step={8}
                  />,
                )}
                {box(
                  'upscaleMaxResolution',
                  <SliderField
                    label="Max resolution"
                    value={value.maxResolution}
                    onChange={(maxResolution) => onChange({ maxResolution: Math.round(maxResolution) })}
                    min={64}
                    max={8192}
                    step={8}
                  />,
                )}
              </div>
              {box(
                'upscaleColor',
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs text-muted">Color correction</span>
                  <SelectField
                    value={COLOR.includes(value.colorCorrection) ? value.colorCorrection : COLOR[0]}
                    onChange={(colorCorrection) => onChange({ colorCorrection })}
                    options={COLOR}
                  />
                </div>,
              )}
              <div className="grid grid-cols-2 gap-stack">
                {box(
                  'upscaleInputNoise',
                  <SliderField
                    label="Input noise"
                    value={value.inputNoiseScale}
                    onChange={(inputNoiseScale) => onChange({ inputNoiseScale })}
                    min={0}
                    max={1}
                    step={0.01}
                  />,
                )}
                {box(
                  'upscaleLatentNoise',
                  <SliderField
                    label="Latent noise"
                    value={value.latentNoiseScale}
                    onChange={(latentNoiseScale) => onChange({ latentNoiseScale })}
                    min={0}
                    max={1}
                    step={0.01}
                  />,
                )}
              </div>
            </>
          ) : (
            <>
              {box('upscaleSize', sizeBlock)}
              <div className="grid grid-cols-2 gap-stack">
                {box(
                  'upscaleMethod',
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-xs text-muted">Method</span>
                    <SelectField
                      value={value.upscaleMethod}
                      onChange={(upscaleMethod) => onChange({ upscaleMethod })}
                      options={[...IMAGE_SCALE_METHODS]}
                    />
                  </div>,
                )}
                {box(
                  'upscaleCrop',
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-xs text-muted">Crop</span>
                    <SelectField value={value.crop} onChange={(crop) => onChange({ crop })} options={[...IMAGE_SCALE_CROPS]} />
                  </div>,
                )}
              </div>
            </>
          )}
        </div>
      </ParamSection>
      {box(
        'upscaleSeed',
        <div className="flex items-end gap-stack">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-xs text-muted">Seed</span>
            <NumberField
              value={value.seed}
              onChange={(seed) => onChange({ seed: Math.round(seed) })}
              min={value.seed < 0 ? -1 : 0}
              max={SEED_U32_MAX}
            />
          </label>
          <div className="flex w-32 shrink-0 flex-col gap-1">
            <span className="text-xs text-muted">After generation</span>
            <SelectField
              value={value.seedAfter ?? 'fixed'}
              onChange={(next) => {
                const seedAfter = next as SeedAfter
                if (seedAfter === 'randomize') {
                  onChange({ seedAfter, seed: -1 })
                  return
                }
                if (value.seedAfter === 'randomize' && lastSeed != null) {
                  onChange({ seedAfter, seed: wrapSeed32(lastSeed) })
                  return
                }
                onChange({ seedAfter })
              }}
              options={[...SEED_AFTER]}
            />
          </div>
        </div>,
      )}
      {seedvr2 ? (
        <ParamSection title="Other">
          {box(
            'upscaleAdvanced',
            <ExpandSection title="Advanced" fit>
          <div className="flex flex-col gap-stack">
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
            </ExpandSection>,
          )}
        </ParamSection>
      ) : null}
    </div>
  )
}
