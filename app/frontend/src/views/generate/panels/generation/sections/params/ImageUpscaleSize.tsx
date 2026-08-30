import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { IconButton } from '@/components/controls/button/IconButton.tsx'
import { SelectField } from '@/components/controls/select/SelectField.tsx'
import { SliderField } from '@/components/controls/slider/SliderField.tsx'
import { type ImageUpscaleSettings } from '@/stores/generateStore.ts'
import {
  ASPECTS,
  formatSize,
  inferScaler,
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

function scaledSize(width: number, height: number, scale: number) {
  const factor = Math.max(1, Math.min(8, scale))
  return { w: snapDim(width * factor), h: snapDim(height * factor) }
}

export function ImageUpscaleSize({
  value,
  source,
  setResolutions,
  onChange,
}: {
  value: ImageUpscaleSettings
  source: { w: number; h: number }
  setResolutions: string[]
  onChange: (next: Partial<ImageUpscaleSettings>) => void
}) {
  const scaled = scaledSize(source.w, source.h, value.scale)
  const current = value.sizeMode === 'scale' ? scaled : { w: value.width, h: value.height }

  function onSizeMode(mode: HiresSizeMode) {
    if (mode === 'scaler') {
      const inferred = inferScaler(current.w, current.h)
      const size = sizeFromScaler(inferred.aspect, inferred.megapixels)
      onChange({
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
      onChange({ sizeMode: 'set', width: size.w, height: size.h })
      return
    }
    if (mode === 'raw') {
      onChange({ sizeMode: 'raw', width: current.w, height: current.h })
      return
    }
    onChange({ sizeMode: 'scale' })
  }

  return (
    <div className="flex flex-col gap-stack">
      <div className="flex items-center gap-stack">
        <div className="flex min-w-0 rounded border border-line bg-panel text-xs">
          {SIZE_MODES.map((mode, index) => (
            <button
              key={mode.id}
              type="button"
              className={[
                'px-2 py-1',
                index === 0 ? 'rounded-l' : '',
                index === SIZE_MODES.length - 1 ? 'rounded-r' : '',
                value.sizeMode === mode.id ? 'bg-line text-ink' : 'text-muted hover:text-ink',
              ].join(' ')}
              onClick={() => onSizeMode(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </div>
        {value.sizeMode === 'scaler' ? (
          <span className="text-xs text-muted">
            {value.width} × {value.height}
          </span>
        ) : null}
      </div>
      {value.sizeMode === 'scale' ? (
        <SliderField
          label={`Scale (${scaled.w}x${scaled.h})`}
          value={value.scale}
          onChange={(scale) => onChange({ scale })}
          min={1}
          max={4}
          step={0.05}
        />
      ) : (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-stack">
          <div className="flex min-w-0 flex-col gap-2">
            {value.sizeMode === 'raw' ? (
              <>
                <SliderField
                  label="Width"
                  value={value.width}
                  onChange={(width) => onChange({ width })}
                  min={64}
                  max={4096}
                  step={8}
                />
                <SliderField
                  label="Height"
                  value={value.height}
                  onChange={(height) => onChange({ height })}
                  min={64}
                  max={4096}
                  step={8}
                />
              </>
            ) : value.sizeMode === 'set' ? (
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs text-muted">Resolution</span>
                  <SelectField
                    value={formatSize({
                      w: Math.max(value.width, value.height),
                      h: Math.min(value.width, value.height),
                    })}
                    onChange={(key) => {
                      const size = parseSize(key)
                      if (!size) {
                        return
                      }
                      const next = orientSize(size, value.height > value.width)
                      onChange({ width: next.w, height: next.h })
                    }}
                    options={[
                      ...new Set([
                        formatSize({
                          w: Math.max(value.width, value.height),
                          h: Math.min(value.width, value.height),
                        }),
                        ...setResolutions,
                      ]),
                    ].map((key) => {
                      const size = parseSize(key)
                      return {
                        value: key,
                        label: size ? formatSize(orientSize(size, value.height > value.width)) : key,
                      }
                    })}
                  />
                </div>
                <div className="inline-flex self-start rounded border border-line bg-panel text-xs">
                  <button
                    type="button"
                    className={[
                      'rounded-l px-2 py-1',
                      value.height <= value.width ? 'bg-line text-ink' : 'text-muted hover:text-ink',
                    ].join(' ')}
                    onClick={() => {
                      const next = orientSize({ w: value.width, h: value.height }, false)
                      onChange({ width: next.w, height: next.h })
                    }}
                  >
                    Horizontal
                  </button>
                  <button
                    type="button"
                    className={[
                      'rounded-r px-2 py-1',
                      value.height > value.width ? 'bg-line text-ink' : 'text-muted hover:text-ink',
                    ].join(' ')}
                    onClick={() => {
                      const next = orientSize({ w: value.width, h: value.height }, true)
                      onChange({ width: next.w, height: next.h })
                    }}
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
                    value={value.aspect}
                    onChange={(id) => {
                      const size = sizeFromScaler(id, value.megapixels)
                      onChange({ aspect: id, width: size.width, height: size.height })
                    }}
                    options={ASPECTS.map((item) => ({ value: item.id, label: item.label }))}
                  />
                </div>
                <SliderField
                  label="Megapixels"
                  value={value.megapixels}
                  onChange={(megapixels) => {
                    const size = sizeFromScaler(value.aspect, megapixels)
                    onChange({ megapixels, width: size.width, height: size.height })
                  }}
                  min={0.2}
                  max={4}
                  step={0.05}
                />
              </>
            )}
          </div>
          <IconButton
            aria-label="Swap width and height"
            onClick={() => {
              const [aw, ah] = value.aspect.split(':')
              const flipped = `${ah}:${aw}`
              onChange({
                width: value.height,
                height: value.width,
                aspect: ASPECTS.some((item) => item.id === flipped) ? flipped : value.aspect,
              })
            }}
          >
            <AppIcon id="arrow-up-down" />
          </IconButton>
        </div>
      )}
    </div>
  )
}
