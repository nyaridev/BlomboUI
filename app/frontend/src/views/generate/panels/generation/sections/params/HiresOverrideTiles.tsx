import { FloatingModelsView } from '@/components/composites/models/FloatingModelsView.tsx'
import { CheckRow } from '@/components/controls/check-row/CheckRow.tsx'
import { LoraStrengthSlider } from '@/components/controls/slider/LoraStrengthSlider.tsx'
import { modelThumbSrc } from '@/lib/gallery/thumbView.ts'
import { modelTypesMatch } from '@/lib/modelTypes.ts'
import type { ModelEntry, ModelLists, ThumbView } from '@/lib/api.ts'
import { hiresDiffusion } from '@/views/generate/panels/generation/generateHelpers.ts'
import { modelPath, useModelsStore } from '@/stores/modelsStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useThumbView } from '@/stores/thumbnailScopeStore.ts'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { ModelTile } from '@/views/generate/panels/chrome/sections/tiles/ModelTile.tsx'
import { modelTileSpec } from '@/views/generate/panels/chrome/sections/tiles/modelLayouts.ts'
import { displayName } from '@/views/generate/panels/chrome/sections/tiles/modelTileUtils.ts'

import { type HiresLora, type HiresSettings, useGenerateStore } from '@/stores/generateStore.ts'

const LABEL = 'truncate px-0.5 text-[10px] uppercase tracking-wide text-muted'

export function HiresOverrideTiles({
  hires,
  patchHires,
  locked,
}: {
  hires: HiresSettings
  patchHires: (next: Partial<HiresSettings>) => void
  locked: boolean
}) {
  const style = useGenerateStore((s) => s.modelTileStyle)
  const spec = modelTileSpec(style)
  const checkpoints = useModelsStore((s) => s.checkpoints)
  const diffusionModels = useModelsStore((s) => s.diffusion_models)
  const vaes = useModelsStore((s) => s.vae)
  const textEncoders = useModelsStore((s) => s.text_encoders)
  const loraItems = useModelsStore((s) => s.loras)
  const loraStrengthMin = useSettingsStore((s) => s.loraStrengthMin)
  const loraStrengthMax = useSettingsStore((s) => s.loraStrengthMax)
  const loraSliderMin = useSettingsStore((s) => s.loraSliderMin)
  const loraSliderMax = useSettingsStore((s) => s.loraSliderMax)
  const checkpointView = useThumbView('checkpoints')
  const teView = useThumbView('text_encoders')
  const vaeView = useThumbView('vae')
  const loraView = useThumbView('loras')
  const baseModels = useMemo(() => [...checkpoints, ...diffusionModels], [checkpoints, diffusionModels])
  const unetSet = useMemo(() => new Set(diffusionModels), [diffusionModels])
  const diffusion = hiresDiffusion(hires.checkpoint, diffusionModels)
  const checkpointItem = baseModels.find((item) => modelPath(item) === hires.checkpoint)
  const [hoverLoras, setHoverLoras] = useState(false)
  const taken = hires.loras.map((row) => row.path)

  function itemKind(item: ModelEntry): keyof ModelLists {
    return unetSet.has(item) ? 'diffusion_models' : 'checkpoints'
  }

  function setLora(path: string, patch: Partial<HiresLora>) {
    patchHires({
      loras: hires.loras.map((row) => (row.path === path ? { ...row, ...patch } : row)),
    })
  }

  function addLora(path: string) {
    if (taken.includes(path)) {
      return
    }
    const item = loraItems.find((row) => row.path === path)
    patchHires({ loras: [...hires.loras, { path, strength: item?.strength ?? 1 }] })
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-stack">
      <CheckRow
        className="min-w-0 flex-1"
        align="start"
        on={hires.modelOverride}
        onChange={(modelOverride) => patchHires({ modelOverride })}
        locked={locked}
      >
        <div className={['flex min-w-0 flex-wrap items-start', spec.gap].join(' ')}>
          <PickTile
            role="Checkpoint"
            kind="checkpoints"
            items={baseModels}
            itemKind={itemKind}
            value={hires.checkpoint}
            viewKind={diffusion ? 'diffusion_models' : 'checkpoints'}
            view={checkpointView}
            chromeKey="generate-hires-checkpoint"
            onChange={(checkpoint) => patchHires({ checkpoint })}
            onClear={locked ? undefined : () => patchHires({ checkpoint: '' })}
            disabled={locked}
          />
          {diffusion ? (
            <>
              <PickTile
                role="Text encoder"
                kind="text_encoders"
                items={textEncoders}
                value={hires.textEncoder}
                viewKind="text_encoders"
                view={teView}
                chromeKey="generate-hires-text_encoders"
                onChange={(textEncoder) => patchHires({ textEncoder })}
                onClear={locked ? undefined : () => patchHires({ textEncoder: '' })}
                disabled={locked}
              />
              <PickTile
                role="VAE"
                kind="vae"
                items={vaes}
                value={hires.vae}
                viewKind="vae"
                view={vaeView}
                chromeKey="generate-hires-vae"
                onChange={(vae) => patchHires({ vae })}
                onClear={locked ? undefined : () => patchHires({ vae: '' })}
                disabled={locked}
              />
            </>
          ) : null}
        </div>
      </CheckRow>
      <CheckRow
        align="start"
        on={hires.loraOverride}
        onChange={(loraOverride) => patchHires({ loraOverride })}
        locked={locked}
      >
        <div
          className="flex min-w-0 flex-col gap-0.5"
          onMouseEnter={() => setHoverLoras(true)}
          onMouseLeave={() => setHoverLoras(false)}
        >
          <span className={LABEL}>LoRa</span>
          <div className={['flex min-w-0 flex-wrap items-start', spec.gap].join(' ')}>
            {hires.loras.map((row) => {
              const item = loraItems.find((entry) => entry.path === row.path) ?? null
              const rangeMin = item?.slider ? loraSliderMin : loraStrengthMin
              const rangeMax = item?.slider ? loraSliderMax : loraStrengthMax
              const typeMismatch = Boolean(
                checkpointItem?.types?.length &&
                  item?.types?.length &&
                  !modelTypesMatch(checkpointItem.types, item.types),
              )
              return (
                <PickTile
                  key={row.path}
                  role="LoRA"
                  kind="loras"
                  items={loraItems}
                  value={row.path}
                  viewKind="loras"
                  view={loraView}
                  chromeKey="generate-hires-loras"
                  onChange={(path) => setLora(row.path, { path })}
                  onClear={locked ? undefined : () => patchHires({ loras: hires.loras.filter((entry) => entry.path !== row.path) })}
                  disabled={locked}
                  warn={typeMismatch}
                  hideLabel
                  strengthControl={
                    <LoraStrengthSlider
                      label={displayName(item, row.path)}
                      value={row.strength}
                      min={rangeMin}
                      max={rangeMax}
                      onChange={(strength) => setLora(row.path, { strength })}
                    />
                  }
                  showStrengthControl={hoverLoras}
                />
              )
            })}
            <PickTile
              role="LoRA"
              kind="loras"
              items={loraItems}
              value=""
              viewKind="loras"
              view={loraView}
              chromeKey="generate-hires-loras"
              onChange={addLora}
              disabled={locked}
              hideLabel
            />
          </div>
        </div>
      </CheckRow>
    </div>
  )
}

function PickTile({
  role,
  kind,
  items,
  itemKind,
  value,
  viewKind,
  view,
  chromeKey,
  onChange,
  onClear,
  disabled,
  warn,
  hideLabel,
  strengthControl,
  showStrengthControl,
}: {
  role: string
  kind: keyof ModelLists
  items: ModelEntry[]
  itemKind?: (item: ModelEntry) => keyof ModelLists
  value: string
  viewKind: keyof ModelLists
  view?: ThumbView
  chromeKey: string
  onChange: (value: string) => void
  onClear?: () => void
  disabled: boolean
  warn?: boolean
  hideLabel?: boolean
  strengthControl?: ReactNode
  showStrengthControl?: boolean
}) {
  const style = useGenerateStore((s) => s.modelTileStyle)
  const spec = modelTileSpec(style)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const empty = !value.trim()
  const item = items.find((row) => modelPath(row) === value) ?? null
  const thumbKind = item && itemKind ? itemKind(item) : viewKind

  function show() {
    if (disabled) {
      return
    }
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) {
      return
    }
    setAnchor(rect)
    setOpen(true)
  }

  return (
    <div ref={wrapRef} className="flex shrink-0 flex-col gap-0.5">
      {hideLabel ? null : (
        <span className={[LABEL, spec.width].join(' ')} title={role}>
          {role}
        </span>
      )}
      <ModelTile
        style={style}
        role={role}
        name={empty ? role : displayName(item, value)}
        src={item ? modelThumbSrc(thumbKind, item, view) : null}
        empty={empty}
        unresolved={!empty && !item}
        warn={warn}
        onOpen={() => (open ? setOpen(false) : show())}
        onClear={onClear && !empty && !disabled ? onClear : undefined}
        strengthControl={strengthControl}
        showStrengthControl={showStrengthControl}
      />
      {open && anchor ? (
        <FloatingModelsView
          kind={kind}
          items={items}
          itemKind={itemKind}
          value={value}
          chromeKey={chromeKey}
          anchor={anchor}
          onSelect={(path) => {
            onChange(path)
            setOpen(false)
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  )
}
