import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { ModelPickTile } from '@/components/composites/models/ModelPickTile.tsx'
import { CheckRow } from '@/components/controls/check-row/CheckRow.tsx'
import { CheckboxControl } from '@/components/controls/toggle/CheckboxControl.tsx'
import { IconButton } from '@/components/controls/button/IconButton.tsx'
import { NumberField } from '@/components/controls/number/NumberField.tsx'
import { SelectField } from '@/components/controls/select/SelectField.tsx'
import { SliderField } from '@/components/controls/slider/SliderField.tsx'
import { SEED_AFTER, type HiresSettings, type SeedAfter, useGenerateStore } from '@/stores/generateStore.ts'
import { PromptField } from '@/views/generate/panels/chrome/sections/prompt/PromptSuggest.tsx'
import { HiresOverrideTiles } from '@/views/generate/panels/generation/sections/params/HiresOverrideTiles.tsx'
import { ParamSection } from '@/views/generate/panels/generation/sections/params/ParamSection.tsx'
import {
  ASPECTS,
  formatSize,
  IMAGE_SCALE_CROPS,
  IMAGE_SCALE_METHODS,
  inferScaler,
  listedChoices,
  orientSize,
  parseSize,
  sizeFromScaler,
  snapDim,
  snapToSet,
  type HiresSizeMode,
} from '@/views/generate/panels/generation/sections/params/resolutions.ts'

const SIZE_MODES: { id: HiresSizeMode; label: string }[] = [
  { id: 'scale', label: 'Scale' },
  { id: 'raw', label: 'Raw' },
  { id: 'scaler', label: 'Scaler' },
  { id: 'set', label: 'Set' },
]

const BOX = 'rounded-md border border-line bg-panel p-2.5'

function scaledSize(width: number, height: number, scale: number) {
  const factor = Math.max(1, Math.min(8, scale))
  return { w: snapDim(width * factor), h: snapDim(height * factor) }
}

export function HiresExtrasBody({
  hires,
  patchHires,
  locked,
  width,
  height,
  lastSeed,
  samplers,
  schedulers,
  hiddenSamplers,
  hiddenSchedulers,
  setResolutions,
}: {
  hires: HiresSettings
  patchHires: (next: Partial<HiresSettings>) => void
  locked: boolean
  width: number
  height: number
  lastSeed: number | null
  samplers: string[]
  schedulers: string[]
  hiddenSamplers: string[]
  hiddenSchedulers: string[]
  setResolutions: string[]
}) {
  const checkpoint = useGenerateStore((s) => s.checkpoint)
  const scaled = scaledSize(width, height, hires.scale)
  const current = hires.sizeMode === 'scale' ? scaled : { w: hires.width, h: hires.height }

  function onSizeMode(mode: HiresSizeMode) {
    if (mode === 'scaler') {
      const inferred = inferScaler(current.w, current.h)
      const size = sizeFromScaler(inferred.aspect, inferred.megapixels)
      patchHires({
        sizeMode: 'scaler',
        aspect: inferred.aspect,
        megapixels: inferred.megapixels,
        width: size.width,
        height: size.height,
      })
      return
    }
    if (mode === 'set') {
      const size = snapToSet(current.w, current.h, setResolutions)
      patchHires({ sizeMode: 'set', width: size.w, height: size.h })
      return
    }
    if (mode === 'raw') {
      patchHires({ sizeMode: 'raw', width: current.w, height: current.h })
      return
    }
    patchHires({ sizeMode: 'scale' })
  }

  function onSetSize(key: string) {
    const size = parseSize(key)
    if (!size) {
      return
    }
    const next = orientSize(size, hires.height > hires.width)
    patchHires({ width: next.w, height: next.h })
  }

  function onOrient(vertical: boolean) {
    const next = orientSize({ w: hires.width, h: hires.height }, vertical)
    patchHires({ width: next.w, height: next.h })
  }

  function onAspect(id: string) {
    const size = sizeFromScaler(id, hires.megapixels)
    patchHires({ aspect: id, width: size.width, height: size.height })
  }

  function onMegapixels(value: number) {
    const size = sizeFromScaler(hires.aspect, value)
    patchHires({ megapixels: value, width: size.width, height: size.height })
  }

  function swapSize() {
    const [aw, ah] = hires.aspect.split(':')
    const flipped = `${ah}:${aw}`
    patchHires({
      width: hires.height,
      height: hires.width,
      aspect: ASPECTS.some((item) => item.id === flipped) ? flipped : hires.aspect,
    })
  }

  return (
    <div className="flex flex-col gap-stack">
      <div className="flex justify-center">
        <div className="flex flex-col items-center gap-0.5">
          <span className="truncate px-0.5 text-[10px] uppercase tracking-wide text-muted">Upscale</span>
          <ModelPickTile
            kind="upscale_models"
            role="Upscale"
            size="tall"
            value={hires.upscaleModel}
            onChange={(upscaleModel) => patchHires({ upscaleModel })}
            onClear={locked ? undefined : () => patchHires({ upscaleModel: '' })}
            disabled={locked}
          />
        </div>
      </div>
      <ParamSection title="Params">
        <div className="flex flex-col gap-stack">
      <div className="flex items-center gap-stack">
        <div className="inline-flex rounded border border-line bg-panel text-xs">
          {SIZE_MODES.map((mode, index) => (
            <button
              key={mode.id}
              type="button"
              disabled={locked}
              className={[
                'px-2 py-1',
                index === 0 ? 'rounded-l' : '',
                index === SIZE_MODES.length - 1 ? 'rounded-r' : '',
                hires.sizeMode === mode.id ? 'bg-line text-ink' : 'text-muted hover:text-ink',
              ].join(' ')}
              onClick={() => onSizeMode(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </div>
        {hires.sizeMode === 'scaler' ? (
          <span className="text-xs text-muted">
            {hires.width} × {hires.height}
          </span>
        ) : null}
      </div>
      {hires.sizeMode === 'scale' ? (
        <SliderField
          label={`Scale (${scaled.w}x${scaled.h})`}
          value={hires.scale}
          onChange={(scale) => patchHires({ scale })}
          min={1}
          max={4}
          step={0.05}
        />
      ) : (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-stack">
          <div className="flex min-w-0 flex-col gap-2">
            {hires.sizeMode === 'raw' ? (
              <>
                <SliderField
                  label="Width"
                  value={hires.width}
                  onChange={(next) => patchHires({ width: next })}
                  min={64}
                  max={4096}
                  step={8}
                />
                <SliderField
                  label="Height"
                  value={hires.height}
                  onChange={(next) => patchHires({ height: next })}
                  min={64}
                  max={4096}
                  step={8}
                />
              </>
            ) : hires.sizeMode === 'set' ? (
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs text-muted">Resolution</span>
                  <SelectField
                    value={formatSize({
                      w: Math.max(hires.width, hires.height),
                      h: Math.min(hires.width, hires.height),
                    })}
                    onChange={onSetSize}
                    options={[
                      ...new Set([
                        formatSize({
                          w: Math.max(hires.width, hires.height),
                          h: Math.min(hires.width, hires.height),
                        }),
                        ...setResolutions,
                      ]),
                    ].map((key) => {
                      const size = parseSize(key)
                      return {
                        value: key,
                        label: size ? formatSize(orientSize(size, hires.height > hires.width)) : key,
                      }
                    })}
                  />
                </div>
                <div className="inline-flex self-start rounded border border-line bg-panel text-xs">
                  <button
                    type="button"
                    disabled={locked}
                    className={[
                      'rounded-l px-2 py-1',
                      hires.height <= hires.width ? 'bg-line text-ink' : 'text-muted hover:text-ink',
                    ].join(' ')}
                    onClick={() => onOrient(false)}
                  >
                    Horizontal
                  </button>
                  <button
                    type="button"
                    disabled={locked}
                    className={[
                      'rounded-r px-2 py-1',
                      hires.height > hires.width ? 'bg-line text-ink' : 'text-muted hover:text-ink',
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
                  <span className="text-xs text-muted">Aspect</span>
                  <SelectField
                    value={hires.aspect}
                    onChange={onAspect}
                    options={ASPECTS.map((item) => ({ value: item.id, label: item.label }))}
                  />
                </div>
                <SliderField
                  label="Megapixels"
                  value={hires.megapixels}
                  onChange={onMegapixels}
                  min={0.2}
                  max={4}
                  step={0.05}
                />
              </>
            )}
          </div>
          <IconButton aria-label="Swap width and height" onClick={swapSize} disabled={locked}>
            <AppIcon id="arrow-up-down" />
          </IconButton>
        </div>
      )}
      <div className="grid grid-cols-2 items-start gap-stack">
        <SliderField label="Steps" value={hires.steps} onChange={(steps) => patchHires({ steps })} min={1} max={150} />
        <SliderField
          label="Denoise"
          value={hires.denoise}
          onChange={(denoise) => patchHires({ denoise })}
          min={0}
          max={1}
          step={0.05}
        />
      </div>
      <div className="grid grid-cols-2 gap-stack">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs text-muted">Method</span>
          <SelectField
            value={hires.upscaleMethod}
            onChange={(upscaleMethod) => patchHires({ upscaleMethod })}
            options={[...IMAGE_SCALE_METHODS]}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs text-muted">Crop</span>
          <SelectField value={hires.crop} onChange={(crop) => patchHires({ crop })} options={[...IMAGE_SCALE_CROPS]} />
        </div>
      </div>
        </div>
      </ParamSection>
      <ParamSection title="Settings">
        <div className="grid w-full grid-cols-2 gap-cluster">
          <label className={`${BOX} flex min-w-0 items-center gap-2 text-sm text-ink`}>
            <CheckboxControl
              checked={hires.saveBefore}
              disabled={locked}
              onChange={(saveBefore) => patchHires({ saveBefore })}
            />
            Save image before hires. fix
          </label>
          <label className={`${BOX} flex min-w-0 items-center gap-2 text-sm text-ink`}>
            <CheckboxControl
              checked={hires.clearVram}
              disabled={locked}
              onChange={(clearVram) => patchHires({ clearVram })}
            />
            Clear VRAM before and after hires. fix
          </label>
        </div>
      </ParamSection>
      <ParamSection title="Overrides">
        <div className="flex flex-col gap-stack">
          <HiresOverrideTiles hires={hires} patchHires={patchHires} locked={locked} />
          <div className="grid grid-cols-3 gap-stack">
            <CheckRow
              on={hires.samplerOverride}
              onChange={(samplerOverride) => patchHires({ samplerOverride })}
              locked={locked}
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-xs text-muted">Sampler</span>
                <SelectField
                  value={hires.sampler}
                  onChange={(sampler) => patchHires({ sampler })}
                  options={listedChoices(samplers, hiddenSamplers, hires.sampler)}
                />
              </div>
            </CheckRow>
            <CheckRow
              on={hires.schedulerOverride}
              onChange={(schedulerOverride) => patchHires({ schedulerOverride })}
              locked={locked}
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-xs text-muted">Scheduler</span>
                <SelectField
                  value={hires.scheduler}
                  onChange={(scheduler) => patchHires({ scheduler })}
                  options={listedChoices(schedulers, hiddenSchedulers, hires.scheduler)}
                />
              </div>
            </CheckRow>
            <CheckRow on={hires.cfgOverride} onChange={(cfgOverride) => patchHires({ cfgOverride })} locked={locked}>
              <SliderField
                label="CFG"
                value={hires.cfg}
                onChange={(cfg) => patchHires({ cfg })}
                min={1}
                max={30}
                step={0.5}
              />
            </CheckRow>
          </div>
          <CheckRow on={hires.seedOverride} onChange={(seedOverride) => patchHires({ seedOverride })} locked={locked}>
            <div className="flex items-end gap-stack">
              <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-xs text-muted">Seed</span>
                <NumberField value={hires.seed} onChange={(seed) => patchHires({ seed })} />
              </label>
              <div className="flex w-32 shrink-0 flex-col gap-1">
                <span className="text-xs text-muted">After generation</span>
                <SelectField
                  value={hires.seedAfter}
                  onChange={(value) => {
                    const seedAfter = value as SeedAfter
                    if (seedAfter === 'randomize') {
                      patchHires({ seedAfter, seed: -1 })
                      return
                    }
                    if (hires.seedAfter === 'randomize' && lastSeed != null) {
                      patchHires({ seedAfter, seed: lastSeed })
                      return
                    }
                    patchHires({ seedAfter })
                  }}
                  options={[...SEED_AFTER]}
                />
              </div>
            </div>
          </CheckRow>
          <CheckRow on={hires.promptOverride} onChange={(promptOverride) => patchHires({ promptOverride })} locked={locked}>
            <div className="h-24 min-w-0">
              <PromptField
                value={hires.prompt}
                onChange={(prompt) => patchHires({ prompt })}
                placeholder="Positive"
                side="prompt"
                checkpoint={hires.modelOverride ? hires.checkpoint : checkpoint}
                companionNegative={hires.negativePrompt}
                onCompanionNegative={(negativePrompt) => patchHires({ negativePrompt })}
              />
            </div>
          </CheckRow>
          <CheckRow
            on={hires.negativeOverride}
            onChange={(negativeOverride) => patchHires({ negativeOverride })}
            locked={locked}
          >
            <div className="h-20 min-w-0">
              <PromptField
                value={hires.negativePrompt}
                onChange={(negativePrompt) => patchHires({ negativePrompt })}
                placeholder="Negative"
                side="negative"
                checkpoint={hires.modelOverride ? hires.checkpoint : checkpoint}
                companionNegative={hires.negativePrompt}
                onCompanionNegative={(negativePrompt) => patchHires({ negativePrompt })}
              />
            </div>
          </CheckRow>
        </div>
      </ParamSection>
    </div>
  )
}
