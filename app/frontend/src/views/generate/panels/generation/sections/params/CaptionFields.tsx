import { CheckboxControl } from '@/components/controls/toggle/CheckboxControl.tsx'
import { NumberField } from '@/components/controls/number/NumberField.tsx'
import { SegmentSwitch } from '@/components/controls/button/SegmentSwitch.tsx'
import { SelectField } from '@/components/controls/select/SelectField.tsx'
import { SliderField } from '@/components/controls/slider/SliderField.tsx'
import { ResizableTextarea } from '@/components/controls/textarea/ResizableTextarea.tsx'
import { ParamSection } from '@/views/generate/panels/generation/sections/params/ParamSection.tsx'
import { type CaptionSettings } from '@/stores/generateStore.ts'
import { type ReactNode } from 'react'

const BOX = 'rounded-md border border-line bg-panel p-2.5'

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

export const QWEN_QUANTS = ['4-bit (VRAM-friendly)', '8-bit (Balanced)', 'None (FP16)']

const FIELD =
  'box-border h-toolbar min-w-0 flex-1 rounded border border-line bg-field px-2 py-0 font-mono text-sm leading-[1.875rem] text-ink outline-none placeholder:text-muted focus:border-accent'

export function CaptionFields({
  value,
  onChange,
  locked = false,
  wrap,
}: {
  value: CaptionSettings
  onChange: (next: Partial<CaptionSettings>) => void
  locked?: boolean
  wrap?: (id: string, node: ReactNode) => ReactNode
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
  return (
    <>
      <ParamSection title="Model">
        <div className="flex flex-col gap-stack">
          {box(
            'captionEngine',
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
            />,
          )}
          {box(
            'captionModel',
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">Model</span>
              {wd14 ? (
                <SelectField
                  value={WD14_MODELS.includes(value.wd14Model) ? value.wd14Model : WD14_MODELS[2]}
                  onChange={(wd14Model) => set({ wd14Model })}
                  options={WD14_MODELS}
                />
              ) : (
                <SelectField
                  value={QWEN_MODELS.includes(value.qwenModel) ? value.qwenModel : QWEN_MODELS[4]}
                  onChange={(qwenModel) => set({ qwenModel })}
                  options={QWEN_MODELS}
                />
              )}
            </div>,
          )}
          {wd14 ? null : box(
              'captionQuantization',
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-xs text-muted">Quantization</span>
                <SelectField
                  value={QWEN_QUANTS.includes(value.quantization) ? value.quantization : QWEN_QUANTS[1]}
                  onChange={(quantization) => set({ quantization })}
                  options={QWEN_QUANTS}
                />
              </div>,
            )}
        </div>
      </ParamSection>
      <ParamSection title="Size">
        <div className="flex flex-col gap-stack">
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
              <span className="text-xs text-muted">Batch count</span>
              <NumberField
                value={value.batchCount}
                onChange={(batchCount) => set({ batchCount })}
                min={1}
                max={16}
              />
            </label>,
          )}
        </div>
      </ParamSection>
      {wd14 ? (
        <ParamSection title="Tags">
          <div className="flex flex-col gap-stack">
            {box(
              'captionPrefix',
              <label className="flex min-w-0 flex-col gap-1">
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
              <label className="flex min-w-0 flex-col gap-1">
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
        </ParamSection>
      ) : (
        <ParamSection title="Prompt">
          {box(
            'captionGuidance',
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">Guidance</span>
              <ResizableTextarea
                className="min-h-24 rounded border border-line bg-field px-2 py-1.5 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
                value={value.guidance}
                disabled={locked}
                onChange={(event) => set({ guidance: event.target.value })}
                placeholder="Optional extra instruction"
                spellCheck={false}
              />
            </label>,
          )}
        </ParamSection>
      )}
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
    </>
  )
}
