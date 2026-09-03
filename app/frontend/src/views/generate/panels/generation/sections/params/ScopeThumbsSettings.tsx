import { ChipSelect } from '@/components/controls/chip-select/ChipSelect.tsx'
import { SegmentSwitch } from '@/components/controls/button/SegmentSwitch.tsx'
import { SelectField } from '@/components/controls/select/SelectField.tsx'
import { TextField } from '@/components/controls/input/TextField.tsx'
import { CheckboxControl } from '@/components/controls/toggle/CheckboxControl.tsx'
import { FloatingModelsView } from '@/components/composites/models/FloatingModelsView.tsx'
import type { ModelEntry, ModelLists } from '@/lib/api.ts'
import { GLOBAL_SCOPE } from '@/lib/gallery/thumbView.ts'
import { modelPath, useModelsStore } from '@/stores/modelsStore.ts'
import { useGenerateStore } from '@/stores/generateStore.ts'
import { useThumbnailScopeStore, useThumbView } from '@/stores/thumbnailScopeStore.ts'
import { useEffect, useMemo, useState } from 'react'
import { PickTile } from '@/views/generate/panels/generation/sections/params/HiresOverrideTiles.tsx'
import { modelTileSpec } from '@/views/generate/panels/chrome/sections/tiles/modelLayouts.ts'
import {
  SCOPE_THUMBS_TYPE_OPTIONS,
  exclusiveScopeIds,
  isScopeThumbsType,
  modelDirOptions,
  patchScopeThumbs,
  type ScopeThumbsSettings,
  type ScopeThumbsSource,
} from '@/views/generate/panels/generation/sections/params/scopeThumbs.ts'

const SOURCE_OPTIONS: { id: ScopeThumbsSource; label: string }[] = [
  { id: 'directory', label: 'Directory' },
  { id: 'selected', label: 'Selected' },
]

export function ScopeThumbsSettings({
  value,
  onChange,
  locked = false,
}: {
  value: ScopeThumbsSettings
  onChange: (value: ScopeThumbsSettings) => void
  locked?: boolean
}) {
  const items = useThumbnailScopeStore((s) => s.items)
  const loaded = useThumbnailScopeStore((s) => s.loaded)
  const load = useThumbnailScopeStore((s) => s.load)
  const checkpoints = useModelsStore((s) => s.checkpoints)
  const diffusionModels = useModelsStore((s) => s.diffusion_models)
  const loras = useModelsStore((s) => s.loras)
  const wildcards = useModelsStore((s) => s.wildcards)
  const style = useGenerateStore((s) => s.modelTileStyle)
  const spec = modelTileSpec(style)
  const checkpointView = useThumbView('checkpoints')
  const loraView = useThumbView('loras')
  const wildView = useThumbView('wildcards')
  const [picker, setPicker] = useState<DOMRect | null>(null)

  useEffect(() => {
    if (!loaded) {
      void load()
    }
  }, [load, loaded])

  const named = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const scopeOptions = useMemo(
    () => items.filter((item) => item.id && item.id !== GLOBAL_SCOPE).map((item) => item.id),
    [items],
  )
  const typeItems = useMemo(() => {
    if (value.type === 'checkpoints') {
      return [...checkpoints, ...diffusionModels]
    }
    if (value.type === 'loras') {
      return loras
    }
    return wildcards
  }, [checkpoints, diffusionModels, loras, value.type, wildcards])
  const dirOptions = useMemo(() => modelDirOptions(typeItems.map((item) => modelPath(item))), [typeItems])
  const unetPaths = useMemo(() => new Set(diffusionModels.map((item) => modelPath(item))), [diffusionModels])
  const picked = useMemo(
    () => value.selected.filter((path) => typeItems.some((item) => modelPath(item) === path)),
    [typeItems, value.selected],
  )

  function commit(patch: Partial<ScopeThumbsSettings>) {
    if (locked) {
      return
    }
    onChange(patchScopeThumbs(value, patch))
  }

  function onScopeIds(next: string[]) {
    if (next.length <= value.scopeIds.length) {
      commit({ scopeIds: next })
      return
    }
    const added = next.find((id) => !value.scopeIds.includes(id))
    commit({ scopeIds: added ? exclusiveScopeIds(value.scopeIds, added, items) : next })
  }

  function itemKind(item: ModelEntry): keyof ModelLists {
    return unetPaths.has(modelPath(item)) ? 'diffusion_models' : 'checkpoints'
  }

  function toggle(path: string) {
    commit({
      selected: value.selected.includes(path)
        ? value.selected.filter((entry) => entry !== path)
        : [...value.selected, path],
    })
  }

  const showSr = value.type === 'loras' || value.type === 'wildcards'
  const galleryKind = value.type === 'checkpoints' ? 'checkpoints' : value.type
  const role = value.type === 'loras' ? 'LoRA' : value.type === 'wildcards' ? 'Wildcard' : 'Checkpoint'
  const view = value.type === 'loras' ? loraView : value.type === 'wildcards' ? wildView : checkpointView

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs text-muted">Thumbnail scope</span>
        <ChipSelect
          value={value.scopeIds}
          onChange={onScopeIds}
          options={scopeOptions}
          placeholder="Empty = Global"
          chipLabel={(id) => named.get(id)?.name ?? id}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs text-muted">Type</span>
        <SelectField
          value={value.type}
          onChange={(next) => commit({ type: isScopeThumbsType(next) ? next : value.type })}
          options={[...SCOPE_THUMBS_TYPE_OPTIONS]}
        />
      </div>
      {showSr ? (
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs text-muted">Prompt S/R</span>
          <TextField
            value={value.search}
            onChange={(event) => commit({ search: event.target.value })}
            placeholder="Leave empty to add on top of the prompt"
            disabled={locked}
          />
        </label>
      ) : null}
      <SegmentSwitch
        fill
        value={value.source}
        options={SOURCE_OPTIONS}
        onChange={(source) => commit({ source })}
        disabled={locked}
      />
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm text-ink">
          <CheckboxControl
            checked={value.skipExisting}
            onChange={(skipExisting) => commit({ skipExisting })}
            disabled={locked}
          />
          Skip existing thumbnails
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <CheckboxControl
            checked={value.applyAfter}
            onChange={(applyAfter) => commit({ applyAfter })}
            disabled={locked}
          />
          Apply after each generation
        </label>
      </div>
      {value.source === 'directory' ? (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs text-muted">Directory</span>
          <SelectField
            value={value.directory}
            onChange={(directory) => commit({ directory })}
            options={dirOptions}
            placeholder="Select a folder…"
            menu="tall"
          />
        </div>
      ) : (
        <div className={['flex min-w-0 flex-wrap items-start', spec.gap].join(' ')}>
          {picked.map((path) => (
            <PickTile
              key={path}
              role={role}
              kind={galleryKind}
              items={typeItems}
              itemKind={value.type === 'checkpoints' ? itemKind : undefined}
              value={path}
              viewKind={
                value.type === 'checkpoints' && unetPaths.has(path) ? 'diffusion_models' : galleryKind
              }
              view={view}
              chromeKey={galleryKind}
              onChange={toggle}
              onPick={setPicker}
              onClear={locked ? undefined : () => commit({ selected: value.selected.filter((entry) => entry !== path) })}
              disabled={locked}
              hideLabel
            />
          ))}
          <PickTile
            role={role}
            kind={galleryKind}
            items={typeItems}
            itemKind={value.type === 'checkpoints' ? itemKind : undefined}
            value=""
            viewKind={galleryKind}
            view={view}
            chromeKey={galleryKind}
            onChange={toggle}
            onPick={setPicker}
            disabled={locked}
            hideLabel
          />
        </div>
      )}
      {picker ? (
        <FloatingModelsView
          kind={galleryKind}
          items={typeItems}
          itemKind={value.type === 'checkpoints' ? itemKind : undefined}
          selected={value.selected}
          chromeKey={galleryKind}
          anchor={picker}
          closeOnSelect={false}
          onSelect={toggle}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </div>
  )
}
