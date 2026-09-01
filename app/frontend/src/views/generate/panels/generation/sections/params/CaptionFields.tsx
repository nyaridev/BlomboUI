import { CheckboxControl } from '@/components/controls/toggle/CheckboxControl.tsx'
import { NumberField } from '@/components/controls/number/NumberField.tsx'
import { SegmentSwitch } from '@/components/controls/button/SegmentSwitch.tsx'
import { SelectField } from '@/components/controls/select/SelectField.tsx'
import { SliderField } from '@/components/controls/slider/SliderField.tsx'
import { ResizableTextarea } from '@/components/controls/textarea/ResizableTextarea.tsx'
import { ParamSection } from '@/views/generate/panels/generation/sections/params/ParamSection.tsx'
import {
  SEED_AFTER,
  SEED_U32_MAX,
  wrapSeed32,
  type CaptionSettings,
  type SeedAfter,
} from '@/stores/generateStore.ts'
import { type ReactNode } from 'react'

const BOX = 'rounded-md border border-line bg-panel p-2.5'
const WD14_DEFAULT = 'wd-v1-4-moat-tagger-v2'

export const WD14_MODELS = [
  'wd-eva02-large-tagger-v3',
  'wd-vit-tagger-v3',
  'wd-swinv2-tagger-v3',
  'wd-convnext-tagger-v3',
  'wd-v1-4-moat-tagger-v2',
  'wd-v1-4-convnextv2-tagger-v2',
  'wd-v1-4-convnext-tagger-v2',
  'wd-v1-4-convnext-tagger',
  'wd-v1-4-vit-tagger-v2',
  'wd-v1-4-swinv2-tagger-v2',
  'wd-v1-4-vit-tagger',
]

export const QWEN_MODELS = [
  'Qwen3-VL-2B-Instruct',
  'Qwen3-VL-2B-Thinking',
  'Qwen3-VL-2B-Instruct-FP8',
  'Qwen3-VL-2B-Thinking-FP8',
  'Qwen3-VL-4B-Instruct',
  'Qwen3-VL-4B-Thinking',
  'Qwen3-VL-4B-Instruct-FP8',
  'Qwen3-VL-4B-Thinking-FP8',
  'Qwen3-VL-8B-Instruct',
  'Qwen3-VL-8B-Thinking',
  'Qwen3-VL-8B-Instruct-FP8',
  'Qwen3-VL-8B-Thinking-FP8',
  'Qwen3-VL-32B-Instruct',
  'Qwen3-VL-32B-Thinking',
  'Qwen3-VL-32B-Instruct-FP8',
  'Qwen3-VL-32B-Thinking-FP8',
  'Qwen2.5-VL-3B-Instruct',
  'Qwen2.5-VL-7B-Instruct',
  'unsloth/Qwen3.5-4B',
  'unsloth/Qwen3.6-27B',
  'unsloth/Qwen3.8-27B',
]

export const QWEN_GGUF_MODELS = [
  'Qwen3VL-4B-Instruct-Q4_K_M.gguf',
  'Qwen3VL-4B-Instruct-Q8_0.gguf',
  'Qwen3VL-4B-Instruct-F16.gguf',
  'Qwen3VL-8B-Instruct-Q4_K_M.gguf',
  'Qwen3VL-8B-Instruct-Q8_0.gguf',
  'Qwen3VL-8B-Instruct-F16.gguf',
  'Qwen3VL-4B-Thinking-Q4_K_M.gguf',
  'Qwen3VL-4B-Thinking-Q8_0.gguf',
  'Qwen3VL-4B-Thinking-F16.gguf',
  'Qwen3VL-8B-Thinking-Q4_K_M.gguf',
  'Qwen3VL-8B-Thinking-Q8_0.gguf',
  'Qwen3VL-8B-Thinking-F16.gguf',
  'Qwen3.5-4B-UD-Q4_K_XL.gguf',
  'Qwen3.6-27B-UD-Q3_K_XL.gguf',
  'Qwen3.8-27B-UD-Q3_K_XL.gguf',
]

export const QWEN_QUANTS = ['4-bit (VRAM-friendly)', '8-bit (Balanced)', 'None (FP16)']

export const QWEN_PRESETS = [
  '🖼️ Tags',
  '🖼️ Simple Description',
  '🖼️ Detailed Description',
  '🖼️ Ultra Detailed Description',
  '🎬 Cinematic Description',
  '🖼️ Detailed Analysis',
  '📹 Video Summary',
  '📖 Short Story',
  '🧩Prompt Refine & Expand',
]

const FIELD =
  'box-border h-toolbar min-w-0 w-full rounded border border-line bg-field px-2 py-0 font-mono text-sm leading-[1.875rem] text-ink outline-none placeholder:text-muted focus:border-accent'

function joinCaptionParts(...parts: string[]) {
  return parts
    .map((part) => part.trim().replace(/^,+|,+$/g, '').trim())
    .filter(Boolean)
    .join(', ')
}

export function CaptionFields({
  value,
  onChange,
  locked = false,
  wrap,
  lastSeed = null,
}: {
  value: CaptionSettings
  onChange: (next: Partial<CaptionSettings>) => void
  locked?: boolean
  wrap?: (id: string, node: ReactNode) => ReactNode
  lastSeed?: number | null
}) {
  const boxed = wrap == null
  function set(next: Partial<CaptionSettings>) {
    if (!locked) {
      onChange(next)
    }
  }
  function box(id: string, node: ReactNode) {
    return wrap ? wrap(id, node) : node
  }
  const wd14 = value.engine === 'wd14'
  const gguf = !wd14 && value.qwenBackend === 'gguf'
  const native = !wd14 && !gguf
  const modelSelect = wd14 ? (
    <SelectField
      value={WD14_MODELS.includes(value.wd14Model) ? value.wd14Model : WD14_DEFAULT}
      onChange={(wd14Model) => set({ wd14Model })}
      options={WD14_MODELS}
    />
  ) : gguf ? (
    <SelectField
      value={QWEN_GGUF_MODELS.includes(value.qwenGgufModel) ? value.qwenGgufModel : QWEN_GGUF_MODELS[1]}
      onChange={(qwenGgufModel) => set({ qwenGgufModel })}
      options={QWEN_GGUF_MODELS}
    />
  ) : (
    <SelectField
      value={QWEN_MODELS.includes(value.qwenModel) ? value.qwenModel : QWEN_MODELS[4]}
      onChange={(qwenModel) => set({ qwenModel })}
      options={QWEN_MODELS}
    />
  )
  return (
    <>
      <ParamSection title="Model">
        <div className="flex flex-col gap-stack">
          {box(
            'captionEngine',
            <div className="flex flex-col gap-stack">
              <SegmentSwitch
                fill
                disabled={locked}
                value={value.engine}
                tone="blue"
                options={[
                  { id: 'wd14', label: 'WD14' },
                  { id: 'qwen', label: 'QwenVL' },
                ]}
                onChange={(engine) => set({ engine })}
              />
              {wd14 ? null : (
                <SegmentSwitch
                  fill
                  disabled={locked}
                  value={value.qwenBackend}
                  tone="blue"
                  options={[
                    { id: 'native', label: 'Native' },
                    { id: 'gguf', label: 'GGUF' },
                  ]}
                  onChange={(qwenBackend) => set({ qwenBackend })}
                />
              )}
            </div>,
          )}
          {native ? (
            <div className="flex min-w-0 gap-stack">
              {box(
                'captionModel',
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-xs text-muted">Model</span>
                  {modelSelect}
                </div>,
              )}
              {box(
                'captionQuantization',
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-xs text-muted">Quantization</span>
                  <SelectField
                    value={QWEN_QUANTS.includes(value.quantization) ? value.quantization : QWEN_QUANTS[1]}
                    onChange={(quantization) => set({ quantization })}
                    options={QWEN_QUANTS}
                  />
                </div>,
              )}
            </div>
          ) : (
            box(
              'captionModel',
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-xs text-muted">Model</span>
                {modelSelect}
              </div>,
            )
          )}
        </div>
      </ParamSection>
      {wd14 ? null : (
        <ParamSection title="Prompt">
          {box(
            'captionGuidance',
            <div className="flex flex-col gap-stack">
              <SegmentSwitch
                fill
                disabled={locked}
                value={value.promptSource}
                tone="blue"
                options={[
                  { id: 'preset', label: 'Preset' },
                  { id: 'custom', label: 'Custom' },
                ]}
                onChange={(promptSource) => set({ promptSource })}
              />
              {value.promptSource === 'preset' ? (
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs text-muted">Preset</span>
                  <SelectField
                    value={QWEN_PRESETS.includes(value.presetPrompt) ? value.presetPrompt : QWEN_PRESETS[2]}
                    onChange={(presetPrompt) => set({ presetPrompt })}
                    options={QWEN_PRESETS}
                  />
                </div>
              ) : (
                <label className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs text-muted">Prompt</span>
                  <ResizableTextarea
                    className="min-h-52 w-full rounded border border-line bg-field px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
                    value={value.guidance}
                    disabled={locked}
                    onChange={(event) => set({ guidance: event.target.value })}
                    spellCheck={false}
                  />
                </label>
              )}
            </div>,
          )}
        </ParamSection>
      )}
      <ParamSection title="Size">
        <div className="grid w-full min-w-0 grid-cols-2 gap-stack">
          {box(
            'captionMegapixels',
            <SliderField
              label="Megapixels"
              value={value.megapixels}
              onChange={(megapixels) => set({ megapixels })}
              min={0.25}
              max={4}
              step={0.05}
            />,
          )}
          {box(
            'captionBatch',
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">Batch size</span>
              <NumberField
                value={value.batchSize}
                onChange={(batchSize) => set({ batchSize })}
                min={1}
                max={16}
              />
            </label>,
          )}
        </div>
      </ParamSection>
      {wd14 ? (
        <ParamSection title="Append Tags">
          <div className="flex w-full min-w-0 flex-col gap-stack">
            <div className="grid w-full min-w-0 grid-cols-2 gap-stack">
              {box(
                'captionPrefix',
                <label className="flex min-w-0 w-full flex-col gap-1">
                  <span className="text-xs text-muted">Prefix</span>
                  <input
                    className={FIELD}
                    value={value.prefix}
                    disabled={locked}
                    onChange={(event) => set({ prefix: event.target.value })}
                    spellCheck={false}
                  />
                </label>,
              )}
              {box(
                'captionSuffix',
                <label className="flex min-w-0 w-full flex-col gap-1">
                  <span className="text-xs text-muted">Suffix</span>
                  <input
                    className={FIELD}
                    value={value.suffix}
                    disabled={locked}
                    onChange={(event) => set({ suffix: event.target.value })}
                    spellCheck={false}
                  />
                </label>,
              )}
            </div>
            <p className="min-w-0 break-words font-mono text-xs text-muted">
              {joinCaptionParts(value.prefix, 'tag1, tag2', value.suffix)}
            </p>
            {box(
              'captionExcludeTags',
              <label className="flex min-w-0 w-full flex-col gap-1">
                <span className="text-xs text-muted">Exclude tags</span>
                <input
                  className={FIELD}
                  value={value.excludeTags}
                  disabled={locked}
                  onChange={(event) => set({ excludeTags: event.target.value })}
                  spellCheck={false}
                />
              </label>,
            )}
          </div>
        </ParamSection>
      ) : null}
      <ParamSection title="Settings">
        <div className="flex flex-col gap-stack">
          {wd14 ? (
            <>
              <div className="grid w-full min-w-0 grid-cols-2 gap-stack">
                {box(
                  'captionThreshold',
                  <SliderField
                    label="Threshold"
                    value={value.threshold}
                    onChange={(threshold) => set({ threshold })}
                    min={0}
                    max={1}
                    step={0.01}
                  />,
                )}
                {box(
                  'captionCharacterThreshold',
                  <SliderField
                    label="Character threshold"
                    value={value.characterThreshold}
                    onChange={(characterThreshold) => set({ characterThreshold })}
                    min={0}
                    max={1}
                    step={0.01}
                  />,
                )}
              </div>
              <div className="grid w-full grid-cols-2 gap-stack">
                {box(
                  'captionReplaceUnderscore',
                  <label className={`${boxed ? BOX : ''} flex min-w-0 items-center gap-2 text-sm text-ink`}>
                    <CheckboxControl
                      checked={value.replaceUnderscore}
                      disabled={locked}
                      onChange={(replaceUnderscore) => set({ replaceUnderscore })}
                    />
                    Replace underscore
                  </label>,
                )}
                {box(
                  'captionTrailingComma',
                  <label className={`${boxed ? BOX : ''} flex min-w-0 items-center gap-2 text-sm text-ink`}>
                    <CheckboxControl
                      checked={value.trailingComma}
                      disabled={locked}
                      onChange={(trailingComma) => set({ trailingComma })}
                    />
                    Trailing comma
                  </label>,
                )}
              </div>
            </>
          ) : (
            <>
              <div className="grid w-full min-w-0 grid-cols-2 gap-stack">
                {box(
                  'captionMaxTokens',
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className="text-xs text-muted">Max tokens</span>
                    <NumberField
                      value={value.maxTokens}
                      onChange={(maxTokens) => set({ maxTokens })}
                      min={16}
                      max={8192}
                    />
                  </label>,
                )}
                {box(
                  'captionKeepModelLoaded',
                  <label className={`${boxed ? BOX : ''} flex min-w-0 items-center gap-2 text-sm text-ink`}>
                    <CheckboxControl
                      checked={value.keepModelLoaded}
                      disabled={locked}
                      onChange={(keepModelLoaded) => set({ keepModelLoaded })}
                    />
                    Keep model loaded
                  </label>,
                )}
              </div>
              {box(
                'captionSeed',
                <div className="flex items-end gap-stack">
                  <label className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-xs text-muted">Seed</span>
                    <NumberField
                      value={value.seed}
                      onChange={(seed) => set({ seed: Math.round(seed) })}
                      min={value.seed < 0 ? -1 : 0}
                      max={SEED_U32_MAX}
                    />
                  </label>
                  <div className="flex w-32 shrink-0 flex-col gap-1">
                    <span className="text-xs text-muted">After generation</span>
                    <SelectField
                      value={value.seedAfter}
                      onChange={(next) => {
                        const seedAfter = next as SeedAfter
                        if (seedAfter === 'randomize') {
                          set({ seedAfter, seed: -1 })
                          return
                        }
                        if (value.seedAfter === 'randomize' && lastSeed != null) {
                          set({ seedAfter, seed: wrapSeed32(lastSeed) })
                          return
                        }
                        set({ seedAfter })
                      }}
                      options={[...SEED_AFTER]}
                    />
                  </div>
                </div>,
              )}
            </>
          )}
          <div className="grid w-full grid-cols-2 gap-stack">
            {box(
              'captionSaveImage',
              <label className={`${boxed ? BOX : ''} flex min-w-0 items-center gap-2 text-sm text-ink`}>
                <CheckboxControl
                  checked={value.saveImage}
                  disabled={locked}
                  onChange={(saveImage) => set({ saveImage })}
                />
                Save image
              </label>,
            )}
            {box(
              'captionOverride',
              <label className={`${boxed ? BOX : ''} flex min-w-0 items-center gap-2 text-sm text-ink`}>
                <CheckboxControl
                  checked={value.overrideExisting}
                  disabled={locked}
                  onChange={(overrideExisting) => set({ overrideExisting })}
                />
                Override existing
              </label>,
            )}
          </div>
        </div>
      </ParamSection>
    </>
  )
}
