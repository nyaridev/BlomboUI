import { CheckRow } from '@/components/controls/check-row/CheckRow.tsx'
import { LoraStrengthSlider } from '@/components/controls/slider/LoraStrengthSlider.tsx'
import type { ModelEntry, ModelLists } from '@/lib/api.ts'
import { modelTypesMatch } from '@/lib/modelTypes.ts'
import { formatLoraStrength } from '@/lib/prompt/loraTags.ts'
import { hiresDiffusion } from '@/views/generate/panels/generation/generateHelpers.ts'
import { modelPath, useModelsStore } from '@/stores/modelsStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useThumbView } from '@/stores/thumbnailScopeStore.ts'
import { useMemo, useState } from 'react'
import { PickTile } from '@/views/generate/panels/generation/sections/params/HiresOverrideTiles.tsx'
import { modelTileSpec } from '@/views/generate/panels/chrome/sections/tiles/modelLayouts.ts'
import { displayName } from '@/views/generate/panels/chrome/sections/tiles/modelTileUtils.ts'
import { type AdetailerUnit, type HiresLora, useGenerateStore } from '@/stores/generateStore.ts'

const LABEL = 'truncate px-0.5 text-[10px] uppercase tracking-wide text-muted'

export function AdetailerModelTiles({
  unit,
  patch,
  locked,
}: {
  unit: AdetailerUnit
  patch: (next: Partial<AdetailerUnit>) => void
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
  const generateCheckpoint = useGenerateStore((s) => s.checkpoint)
  const baseModels = useMemo(() => [...checkpoints, ...diffusionModels], [checkpoints, diffusionModels])
  const unetSet = useMemo(() => new Set(diffusionModels), [diffusionModels])
  const diffusion = hiresDiffusion(unit.checkpoint, diffusionModels)
  const typeSource = unit.modelOverride ? unit.checkpoint : generateCheckpoint
  const checkpointItem = baseModels.find((item) => modelPath(item) === typeSource)
  const [hoverLoras, setHoverLoras] = useState(false)
  const taken = unit.loras.map((row) => row.path)

  function itemKind(item: ModelEntry): keyof ModelLists {
    return unetSet.has(item) ? 'diffusion_models' : 'checkpoints'
  }

  function setLora(path: string, next: Partial<HiresLora>) {
    patch({
      loras: unit.loras.map((row) => (row.path === path ? { ...row, ...next } : row)),
    })
  }

  function addLora(path: string) {
    if (taken.includes(path)) {
      return
    }
    const item = loraItems.find((row) => row.path === path)
    patch({ loras: [...unit.loras, { path, strength: item?.strength ?? 1 }] })
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-stack">
      <CheckRow
        className="min-w-0 flex-1"
        align="start"
        on={unit.modelOverride}
        onChange={(modelOverride) => patch({ modelOverride })}
        locked={locked}
      >
        <div className={['flex min-w-0 flex-wrap items-start', spec.gap].join(' ')}>
          <PickTile
            role="Checkpoint"
            kind="checkpoints"
            items={baseModels}
            itemKind={itemKind}
            value={unit.checkpoint}
            viewKind={diffusion ? 'diffusion_models' : 'checkpoints'}
            view={checkpointView}
            chromeKey="generate-adetailer-checkpoint"
            onChange={(checkpoint) => patch({ checkpoint })}
            onClear={locked ? undefined : () => patch({ checkpoint: '' })}
            disabled={locked}
          />
          {diffusion ? (
            <>
              <PickTile
                role="Text encoder"
                kind="text_encoders"
                items={textEncoders}
                value={unit.textEncoder}
                viewKind="text_encoders"
                view={teView}
                chromeKey="generate-adetailer-text_encoders"
                onChange={(textEncoder) => patch({ textEncoder })}
                onClear={locked ? undefined : () => patch({ textEncoder: '' })}
                disabled={locked}
              />
              <PickTile
                role="VAE"
                kind="vae"
                items={vaes}
                value={unit.vae}
                viewKind="vae"
                view={vaeView}
                chromeKey="generate-adetailer-vae"
                onChange={(vae) => patch({ vae })}
                onClear={locked ? undefined : () => patch({ vae: '' })}
                disabled={locked}
              />
            </>
          ) : null}
        </div>
      </CheckRow>
      <CheckRow align="start" on={unit.loraOverride} onChange={(loraOverride) => patch({ loraOverride })} locked={locked}>
        <div
          className="flex min-w-0 flex-col gap-0.5"
          onMouseEnter={() => setHoverLoras(true)}
          onMouseLeave={() => setHoverLoras(false)}
        >
          <span className={LABEL}>LoRa</span>
          <div className={['flex min-w-0 flex-wrap items-start', spec.gap].join(' ')}>
            {unit.loras.map((row) => {
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
                  chromeKey="generate-adetailer-loras"
                  onChange={(path) => setLora(row.path, { path })}
                  onClear={locked ? undefined : () => patch({ loras: unit.loras.filter((entry) => entry.path !== row.path) })}
                  disabled={locked}
                  warn={typeMismatch}
                  hideLabel
                  autoCheckpoint={typeSource}
                  badge={formatLoraStrength(row.strength)}
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
              chromeKey="generate-adetailer-loras"
              onChange={addLora}
              disabled={locked}
              hideLabel
              autoCheckpoint={typeSource}
            />
          </div>
        </div>
      </CheckRow>
    </div>
  )
}
