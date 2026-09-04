import { ModelPickTile } from '@/components/composites/models/ModelPickTile.tsx'
import { NumberField } from '@/components/controls/number/NumberField.tsx'
import { SegmentSwitch } from '@/components/controls/button/SegmentSwitch.tsx'
import { ParamSection } from '@/views/generate/panels/generation/sections/params/ParamSection.tsx'
import { type DatasetSpritesSettings } from '@/stores/generateStore.ts'
import { type ReactNode } from 'react'

const FIELD =
  'box-border h-toolbar min-w-0 flex-1 rounded border border-line bg-field px-2 py-0 font-mono text-sm leading-[1.875rem] text-ink outline-none placeholder:text-muted focus:border-accent'

export function SpritesFields({
  value,
  onChange,
  locked = false,
  wrap,
}: {
  value: DatasetSpritesSettings
  onChange: (next: Partial<DatasetSpritesSettings>) => void
  locked?: boolean
  wrap?: (id: string, node: ReactNode) => ReactNode
}) {
  function set(next: Partial<DatasetSpritesSettings>) {
    if (!locked) {
      onChange(next)
    }
  }
  function box(id: string, node: ReactNode) {
    return wrap ? wrap(id, node) : node
  }
  return (
    <>
      <ParamSection title="Size">
        {box(
          'spritesSize',
          <div className="grid grid-cols-2 gap-stack">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">Width</span>
              <NumberField value={value.width} onChange={(width) => set({ width })} min={64} max={4096} step={8} />
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">Height</span>
              <NumberField value={value.height} onChange={(height) => set({ height })} min={64} max={4096} step={8} />
            </label>
          </div>,
        )}
      </ParamSection>
      <ParamSection title="Layout">
        <div className="grid grid-cols-2 gap-stack">
          {box(
            'spritesPadding',
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">Padding</span>
              <NumberField value={value.padding} onChange={(padding) => set({ padding })} min={0} max={512} />
            </label>,
          )}
          {box(
            'spritesMinArea',
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">Min area</span>
              <NumberField value={value.minArea} onChange={(minArea) => set({ minArea })} min={1} max={1_000_000} />
            </label>,
          )}
        </div>
      </ParamSection>
      <ParamSection title="Upscale">
        {box(
          'spritesUpscale',
          <div className="flex justify-center">
            <div className="flex flex-col items-center gap-0.5">
              <span className="truncate px-0.5 text-[10px] uppercase tracking-wide text-muted">Upscale</span>
              <ModelPickTile
                kind="upscale_models"
                role="Upscale"
                size="tall"
                chromeKey="generate-upscale"
                value={value.upscaleModel}
                onChange={(upscaleModel) => set({ upscaleModel })}
                onClear={locked ? undefined : () => set({ upscaleModel: '' })}
                disabled={locked}
              />
            </div>
          </div>,
        )}
      </ParamSection>
      <ParamSection title="Background">
        {box(
          'spritesBackground',
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
          </div>,
        )}
      </ParamSection>
    </>
  )
}
