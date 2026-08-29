import { ModelPickTile } from '@/components/composites/models/ModelPickTile.tsx'
import { CheckRow } from '@/components/controls/check-row/CheckRow.tsx'
import { NumberField } from '@/components/controls/number/NumberField.tsx'
import { SelectField } from '@/components/controls/select/SelectField.tsx'
import { SliderField } from '@/components/controls/slider/SliderField.tsx'
import { CheckboxControl } from '@/components/controls/toggle/CheckboxControl.tsx'
import {
  SAM_DETECTION_HINTS,
  SAM_DEVICE_MODES,
  SAM_MASK_NEGATIVES,
  SEED_AFTER,
  type AdetailerUnit,
  type SeedAfter,
} from '@/stores/generateStore.ts'
import { PromptField } from '@/views/generate/panels/chrome/sections/prompt/PromptSuggest.tsx'
import { AdetailerModelTiles } from '@/views/generate/panels/generation/sections/params/AdetailerModelTiles.tsx'
import { AttentionFields, useAttentionCaps } from '@/views/generate/panels/generation/sections/params/AttentionFields.tsx'
import { ParamSection } from '@/views/generate/panels/generation/sections/params/ParamSection.tsx'
import { listedChoices } from '@/views/generate/panels/generation/sections/params/resolutions.ts'

const BOX = 'rounded-md border border-line bg-panel p-2.5'

export function AdetailerUnitBody({
  unit,
  patch,
  locked,
  lastSeed,
  samplers,
  schedulers,
  hiddenSamplers,
  hiddenSchedulers,
}: {
  unit: AdetailerUnit
  patch: (next: Partial<AdetailerUnit>) => void
  locked: boolean
  lastSeed: number | null
  samplers: string[]
  schedulers: string[]
  hiddenSamplers: string[]
  hiddenSchedulers: string[]
}) {
  const { any: attentionInstalled } = useAttentionCaps()
  return (
    <div className="flex flex-col gap-stack">
      <div className="flex items-stretch justify-center gap-cluster">
        <div className="flex flex-col items-center gap-0.5">
          <span className="truncate px-0.5 text-[10px] uppercase tracking-wide text-muted">Detector</span>
          <ModelPickTile
            kind="ultralytics"
            role="BBox"
            size="tall"
            chromeKey="generate-detector"
            value={unit.detector}
            onChange={(detector) => patch({ detector })}
            onClear={locked ? undefined : () => patch({ detector: '' })}
            disabled={locked}
          />
        </div>
        <div className="w-px self-stretch bg-line" />
        <div className="flex flex-col items-center gap-0.5">
          <span className="truncate px-0.5 text-[10px] uppercase tracking-wide text-muted">SAM</span>
          <ModelPickTile
            kind="sams"
            role="SAM"
            size="tall"
            chromeKey="generate-sam"
            value={unit.samModel}
            onChange={(samModel) => patch({ samModel })}
            onClear={locked ? undefined : () => patch({ samModel: '' })}
            disabled={locked}
          />
        </div>
      </div>
      <ParamSection title="Params">
        <div className="grid grid-cols-2 gap-stack">
          <SliderField
            label="Guide size"
            value={unit.guideSize}
            onChange={(guideSize) => patch({ guideSize })}
            min={64}
            max={2048}
            step={8}
          />
          <SliderField
            label="Max size"
            value={unit.maxSize}
            onChange={(maxSize) => patch({ maxSize })}
            min={64}
            max={4096}
            step={8}
          />
          <SliderField label="Steps" value={unit.steps} onChange={(steps) => patch({ steps })} min={1} max={150} />
          <SliderField
            label="Denoise"
            value={unit.denoise}
            onChange={(denoise) => patch({ denoise })}
            min={0}
            max={1}
            step={0.05}
          />
        </div>
      </ParamSection>
      <ParamSection title="Settings">
        <div className="grid w-full grid-cols-2 gap-cluster">
          <label className={`${BOX} flex min-w-0 items-center gap-2 text-sm text-ink`}>
            <CheckboxControl
              checked={unit.fromHires !== false}
              disabled={locked}
              onChange={(fromHires) => patch({ fromHires })}
            />
            Use Hires. fix overrides if enabled
          </label>
        </div>
      </ParamSection>
      <ParamSection title="Overrides">
        <div className="flex flex-col gap-stack">
          <AdetailerModelTiles unit={unit} patch={patch} locked={locked} />
          <CheckRow on={unit.promptOverride} onChange={(promptOverride) => patch({ promptOverride })} locked={locked}>
            <div className="h-24 min-w-0">
              <PromptField
                value={unit.prompt}
                onChange={(prompt) => patch({ prompt })}
                placeholder="Positive"
                side="prompt"
                companionNegative={unit.negativePrompt}
                onCompanionNegative={(negativePrompt) => patch({ negativePrompt })}
              />
            </div>
          </CheckRow>
          <CheckRow
            on={unit.negativeOverride}
            onChange={(negativeOverride) => patch({ negativeOverride })}
            locked={locked}
          >
            <div className="h-20 min-w-0">
              <PromptField
                value={unit.negativePrompt}
                onChange={(negativePrompt) => patch({ negativePrompt })}
                placeholder="Negative"
                side="negative"
                companionNegative={unit.negativePrompt}
                onCompanionNegative={(negativePrompt) => patch({ negativePrompt })}
              />
            </div>
          </CheckRow>
          <div className="grid grid-cols-3 gap-stack">
            <CheckRow
              on={unit.samplerOverride}
              onChange={(samplerOverride) => patch({ samplerOverride })}
              locked={locked}
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-xs text-muted">Sampler</span>
                <SelectField
                  value={unit.sampler}
                  onChange={(sampler) => patch({ sampler })}
                  options={listedChoices(samplers, hiddenSamplers, unit.sampler)}
                />
              </div>
            </CheckRow>
            <CheckRow
              on={unit.schedulerOverride}
              onChange={(schedulerOverride) => patch({ schedulerOverride })}
              locked={locked}
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-xs text-muted">Scheduler</span>
                <SelectField
                  value={unit.scheduler}
                  onChange={(scheduler) => patch({ scheduler })}
                  options={listedChoices(schedulers, hiddenSchedulers, unit.scheduler)}
                />
              </div>
            </CheckRow>
            <CheckRow on={unit.cfgOverride} onChange={(cfgOverride) => patch({ cfgOverride })} locked={locked}>
              <SliderField
                label="CFG"
                value={unit.cfg}
                onChange={(cfg) => patch({ cfg })}
                min={1}
                max={30}
                step={0.5}
              />
            </CheckRow>
          </div>
          <CheckRow on={unit.seedOverride} onChange={(seedOverride) => patch({ seedOverride })} locked={locked}>
            <div className="flex items-end gap-stack">
              <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-xs text-muted">Seed</span>
                <NumberField value={unit.seed} onChange={(seed) => patch({ seed })} />
              </label>
              <div className="flex w-28 shrink-0 flex-col gap-1">
                <span className="text-xs text-muted">After</span>
                <SelectField
                  value={unit.seedAfter}
                  onChange={(value) => {
                    const seedAfter = value as SeedAfter
                    if (seedAfter === 'randomize') {
                      patch({ seedAfter, seed: -1 })
                      return
                    }
                    if (unit.seedAfter === 'randomize' && lastSeed != null) {
                      patch({ seedAfter, seed: lastSeed })
                      return
                    }
                    patch({ seedAfter })
                  }}
                  options={[...SEED_AFTER]}
                />
              </div>
            </div>
          </CheckRow>
          {attentionInstalled ? (
            <CheckRow
              on={unit.attentionOverride}
              onChange={(attentionOverride) => patch({ attentionOverride })}
              locked={locked}
              align="start"
            >
              <AttentionFields
                engine={unit.attentionEngine}
                sageAttention={unit.sageAttention}
                allowCompile={unit.allowCompile}
                onChange={(next) =>
                  patch({
                    ...(next.engine != null ? { attentionEngine: next.engine } : {}),
                    ...(next.sageAttention != null ? { sageAttention: next.sageAttention } : {}),
                    ...(next.allowCompile != null ? { allowCompile: next.allowCompile } : {}),
                  })
                }
                locked={locked}
              />
            </CheckRow>
          ) : null}
        </div>
      </ParamSection>
      <ParamSection title="Advanced">
        <CheckRow
          on={unit.advancedOverride}
          onChange={(advancedOverride) => patch({ advancedOverride })}
          locked={locked}
          align="start"
        >
        <div className="flex flex-col gap-stack">
          <div className="grid grid-cols-2 gap-stack">
            <SliderField
              label="BBox threshold"
              value={unit.bboxThreshold}
              onChange={(bboxThreshold) => patch({ bboxThreshold })}
              min={0}
              max={1}
              step={0.01}
            />
            <SliderField
              label="BBox dilation"
              value={unit.bboxDilation}
              onChange={(bboxDilation) => patch({ bboxDilation })}
              min={-64}
              max={64}
            />
            <SliderField
              label="BBox crop factor"
              value={unit.bboxCropFactor}
              onChange={(bboxCropFactor) => patch({ bboxCropFactor })}
              min={1}
              max={10}
              step={0.1}
            />
          </div>
          <label className={`${BOX} flex min-w-0 items-center gap-2 text-sm text-ink`}>
            <CheckboxControl
              checked={unit.guideSizeFor}
              disabled={locked}
              onChange={(guideSizeFor) => patch({ guideSizeFor })}
            />
            Guide size for bbox
          </label>
          <div className="grid grid-cols-2 gap-stack">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">SAM device</span>
              <SelectField
                value={unit.deviceMode}
                onChange={(deviceMode) => patch({ deviceMode })}
                options={[...SAM_DEVICE_MODES]}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">SAM detection hint</span>
              <SelectField
                value={unit.samDetectionHint}
                onChange={(samDetectionHint) => patch({ samDetectionHint })}
                options={[...SAM_DETECTION_HINTS]}
              />
            </div>
            <SliderField
              label="SAM dilation"
              value={unit.samDilation}
              onChange={(samDilation) => patch({ samDilation })}
              min={-64}
              max={64}
            />
            <SliderField
              label="SAM threshold"
              value={unit.samThreshold}
              onChange={(samThreshold) => patch({ samThreshold })}
              min={0}
              max={1}
              step={0.01}
            />
            <SliderField
              label="SAM bbox expansion"
              value={unit.samBboxExpansion}
              onChange={(samBboxExpansion) => patch({ samBboxExpansion })}
              min={0}
              max={64}
            />
            <SliderField
              label="SAM mask hint threshold"
              value={unit.samMaskHintThreshold}
              onChange={(samMaskHintThreshold) => patch({ samMaskHintThreshold })}
              min={0}
              max={1}
              step={0.01}
            />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">SAM mask hint negative</span>
              <SelectField
                value={unit.samMaskHintUseNegative}
                onChange={(samMaskHintUseNegative) => patch({ samMaskHintUseNegative })}
                options={[...SAM_MASK_NEGATIVES]}
              />
            </div>
            <SliderField label="Feather" value={unit.feather} onChange={(feather) => patch({ feather })} min={0} max={100} />
            <SliderField
              label="Drop size"
              value={unit.dropSize}
              onChange={(dropSize) => patch({ dropSize })}
              min={1}
              max={256}
            />
            <SliderField label="Cycle" value={unit.cycle} onChange={(cycle) => patch({ cycle })} min={1} max={10} />
            <SliderField
              label="Noise mask feather"
              value={unit.noiseMaskFeather}
              onChange={(noiseMaskFeather) => patch({ noiseMaskFeather })}
              min={0}
              max={100}
            />
          </div>
          <div className="grid grid-cols-2 gap-cluster">
            <label className={`${BOX} flex min-w-0 items-center gap-2 text-sm text-ink`}>
              <CheckboxControl
                checked={unit.noiseMask}
                disabled={locked}
                onChange={(noiseMask) => patch({ noiseMask })}
              />
              Noise mask
            </label>
            <label className={`${BOX} flex min-w-0 items-center gap-2 text-sm text-ink`}>
              <CheckboxControl
                checked={unit.forceInpaint}
                disabled={locked}
                onChange={(forceInpaint) => patch({ forceInpaint })}
              />
              Force inpaint
            </label>
            <label className={`${BOX} flex min-w-0 items-center gap-2 text-sm text-ink`}>
              <CheckboxControl
                checked={unit.inpaintModel}
                disabled={locked}
                onChange={(inpaintModel) => patch({ inpaintModel })}
              />
              Inpaint model
            </label>
            <label className={`${BOX} flex min-w-0 items-center gap-2 text-sm text-ink`}>
              <CheckboxControl
                checked={unit.tiledEncode}
                disabled={locked}
                onChange={(tiledEncode) => patch({ tiledEncode })}
              />
              Tiled encode
            </label>
            <label className={`${BOX} flex min-w-0 items-center gap-2 text-sm text-ink`}>
              <CheckboxControl
                checked={unit.tiledDecode}
                disabled={locked}
                onChange={(tiledDecode) => patch({ tiledDecode })}
              />
              Tiled decode
            </label>
          </div>
        </div>
        </CheckRow>
      </ParamSection>
    </div>
  )
}
