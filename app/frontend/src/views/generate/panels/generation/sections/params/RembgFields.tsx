import { CheckboxControl } from '@/components/controls/toggle/CheckboxControl.tsx'
import { NumberField } from '@/components/controls/number/NumberField.tsx'
import { SegmentSwitch } from '@/components/controls/button/SegmentSwitch.tsx'
import { SelectField } from '@/components/controls/select/SelectField.tsx'
import { SliderField } from '@/components/controls/slider/SliderField.tsx'
import { ParamSection } from '@/views/generate/panels/generation/sections/params/ParamSection.tsx'
import { type RembgSettings } from '@/stores/generateStore.ts'

const BOX = 'rounded-md border border-line bg-panel p-2.5'

export const RMBG_MODELS = ['RMBG-2.0', 'INSPYRENET', 'BEN', 'BEN2']
export const BIREFNET_MODELS = [
  'BiRefNet-general',
  'BiRefNet_512x512',
  'BiRefNet-HR',
  'BiRefNet-portrait',
  'BiRefNet-matting',
  'BiRefNet-HR-matting',
  'BiRefNet_lite',
  'BiRefNet_lite-2K',
  'BiRefNet_dynamic',
  'BiRefNet_lite-matting',
  'BiRefNet_toonout',
  'Lucida',
]

const FIELD =
  'box-border h-toolbar min-w-0 flex-1 rounded border border-line bg-field px-2 py-0 font-mono text-sm leading-[1.875rem] text-ink outline-none placeholder:text-muted focus:border-accent'

export function RembgFields({
  value,
  onChange,
  locked = false,
}: {
  value: RembgSettings
  onChange: (next: Partial<RembgSettings>) => void
  locked?: boolean
}) {
  const models = value.engine === 'birefnet' ? BIREFNET_MODELS : RMBG_MODELS
  const model = value.engine === 'birefnet' ? value.birefnetModel : value.rmbgModel
  function set(next: Partial<RembgSettings>) {
    if (!locked) {
      onChange(next)
    }
  }
  return (
    <>
      <ParamSection title="Model">
        <div className="flex flex-col gap-stack">
          <SegmentSwitch
            fill
            disabled={locked}
            value={value.engine}
            tone="blue"
            options={[
              { id: 'rmbg', label: 'RMBG' },
              { id: 'birefnet', label: 'BiRefNet' },
            ]}
            onChange={(engine) => set({ engine })}
          />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-muted">Model</span>
            <SelectField
              value={models.includes(model) ? model : models[0]}
              onChange={(next) => set(value.engine === 'birefnet' ? { birefnetModel: next } : { rmbgModel: next })}
              options={models}
            />
          </div>
          <SliderField
            label="Sensitivity"
            value={value.sensitivity}
            onChange={(sensitivity) => set({ sensitivity })}
            min={0}
            max={1}
            step={0.01}
          />
          {value.engine === 'rmbg' ? (
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">Process resolution</span>
              <NumberField
                value={value.processRes}
                onChange={(processRes) => set({ processRes })}
                min={256}
                max={2048}
                step={128}
              />
            </label>
          ) : null}
          <div className="grid grid-cols-2 gap-cluster">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">Mask blur</span>
              <NumberField value={value.maskBlur} onChange={(maskBlur) => set({ maskBlur })} min={0} max={64} />
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">Mask offset</span>
              <NumberField
                value={value.maskOffset}
                onChange={(maskOffset) => set({ maskOffset })}
                min={value.engine === 'birefnet' ? -20 : -64}
                max={value.engine === 'birefnet' ? 20 : 64}
              />
            </label>
          </div>
        </div>
      </ParamSection>
      <ParamSection title="Background">
        <div className="flex flex-col gap-stack">
          <SegmentSwitch
            fill
            disabled={locked}
            value={value.background}
            tone="blue"
            options={[
              { id: 'Alpha', label: 'Alpha' },
              { id: 'Color', label: 'Color' },
            ]}
            onChange={(background) => set({ background })}
          />
          {value.background === 'Color' ? (
            <label className="flex min-w-0 items-center gap-cluster">
              <span className="text-xs text-muted">Background</span>
              <input
                type="color"
                className="h-toolbar w-10 shrink-0 rounded border border-line bg-field"
                value={value.backgroundColor}
                disabled={locked}
                onChange={(event) => set({ backgroundColor: event.target.value })}
              />
              <input
                className={FIELD}
                value={value.backgroundColor}
                disabled={locked}
                spellCheck={false}
                onChange={(event) => set({ backgroundColor: event.target.value })}
              />
            </label>
          ) : null}
        </div>
      </ParamSection>
      <ParamSection title="Settings">
        <div className="grid w-full grid-cols-3 gap-cluster">
          <label className={`${BOX} flex min-w-0 items-center gap-2 text-sm text-ink`}>
            <CheckboxControl
              checked={value.invertOutput}
              disabled={locked}
              onChange={(invertOutput) => set({ invertOutput })}
            />
            Invert output
          </label>
          <label className={`${BOX} flex min-w-0 items-center gap-2 text-sm text-ink`}>
            <CheckboxControl
              checked={value.refineForeground}
              disabled={locked}
              onChange={(refineForeground) => set({ refineForeground })}
            />
            Refine foreground
          </label>
          <label className={`${BOX} flex min-w-0 items-center gap-2 text-sm text-ink`}>
            <CheckboxControl
              checked={value.preserveMetadata}
              disabled={locked}
              onChange={(preserveMetadata) => set({ preserveMetadata })}
            />
            Preserve metadata
          </label>
        </div>
      </ParamSection>
    </>
  )
}
