import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { FloatingModelsView } from '@/components/composites/models/FloatingModelsView.tsx'
import { modelThumbSrc } from '@/lib/gallery/thumbView.ts'
import type { ModelEntry, ModelLists } from '@/lib/api.ts'
import { galleryScopeKey } from '@/stores/settings/constants.ts'
import { useModelsStore } from '@/stores/modelsStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useThumbView } from '@/stores/thumbnailScopeStore.ts'
import { ModelTile } from '@/views/generate/panels/chrome/sections/tiles/ModelTile.tsx'
import { RowLabel } from '@/views/generate/panels/chrome/sections/tiles/modelTileParts.tsx'
import { modelTileSpec, type ModelTileStyle } from '@/views/generate/panels/chrome/sections/tiles/modelLayouts.ts'
import { displayName } from '@/views/generate/panels/chrome/sections/tiles/modelTileUtils.ts'
import { useEffect, useRef, useState } from 'react'

function chipFile(value: string) {
  return value.replace(/\\/g, '/').split('/').pop() || value
}

function chipMatchesPath(chip: string, path: string) {
  const a = chip.replace(/\\/g, '/')
  const b = path.replace(/\\/g, '/')
  return a === b || chipFile(a) === chipFile(b) || b.endsWith(`/${a}`) || a.endsWith(`/${b}`)
}

function toggleChip(value: string[], path: string) {
  const hit = value.find((chip) => chipMatchesPath(chip, path))
  if (hit) {
    return value.filter((chip) => chip !== hit)
  }
  return [...value, path]
}

function selectedPaths(chips: string[], items: ModelEntry[]) {
  return chips.map((chip) => items.find((item) => chipMatchesPath(chip, item.path))?.path ?? chip)
}

function findItem(items: ModelEntry[], chip: string) {
  return items.find((item) => chipMatchesPath(chip, item.path)) ?? null
}

export function GalleryFilterTiles({
  models,
  loras,
  wildcards,
  onModels,
  onLoras,
  onWildcards,
  chromePrefix = 'gallery-search',
  fixedStyle,
}: {
  models: string[]
  loras: string[]
  wildcards: string[]
  onModels: (value: string[]) => void
  onLoras: (value: string[]) => void
  onWildcards: (value: string[]) => void
  chromePrefix?: string
  fixedStyle?: ModelTileStyle
}) {
  const [picked, setPicked] = useState<ModelTileStyle>('text')
  const style = fixedStyle ?? picked
  const spec = modelTileSpec(style)
  const checkpoints = useModelsStore((s) => s.checkpoints)
  const loraItems = useModelsStore((s) => s.loras)
  const wildcardItems = useModelsStore((s) => s.wildcards)
  const load = useModelsStore((s) => s.load)
  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className={['flex min-w-0 items-start', spec.gap].join(' ')}>
      {fixedStyle ? null : (
        <div className="flex shrink-0 flex-col gap-0.5 py-1.5">
          <RowLabel show={spec.overlay}>&nbsp;</RowLabel>
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <button
              type="button"
              className={[
                'flex aspect-square w-5 shrink-0 items-center justify-center rounded border transition duration-150',
                style === 'text'
                  ? 'border-accent bg-accent text-ink'
                  : 'border-line bg-field text-muted hover:bg-line hover:text-ink',
              ].join(' ')}
              aria-label={style === 'text' ? 'Show thumbnails' : 'Text row'}
              title={style === 'text' ? 'Show thumbnails' : 'Text row'}
              onClick={() => setPicked(style === 'text' ? 'tall' : 'text')}
            >
              <AppIcon id="list" size={10} />
            </button>
            {style === 'text' ? null : (
              <button
                type="button"
                className="flex min-h-5 w-5 flex-1 items-center justify-center rounded border border-line bg-field text-muted transition duration-150 hover:bg-line hover:text-ink"
                aria-label={style === 'compact' ? 'Expand tiles' : 'Compact tiles'}
                title={style === 'compact' ? 'Expand tiles' : 'Compact tiles'}
                onClick={() => setPicked(style === 'compact' ? 'tall' : 'compact')}
              >
                <span
                  className={[
                    'inline-flex transition-transform duration-300 ease-out motion-reduce:transition-none',
                    style === 'compact' ? 'rotate-180' : '',
                  ].join(' ')}
                >
                  <AppIcon id="chevron-up" size={10} />
                </span>
              </button>
            )}
          </div>
        </div>
      )}
      <div className="min-w-0 flex-1 overflow-x-auto py-1.5">
        <div className={['flex w-max items-start', spec.gap].join(' ')}>
          <FilterGroup
            label="Models"
            role="Model"
            kind="checkpoints"
            chromeKey={`${chromePrefix}-checkpoints`}
            style={style}
            chips={models}
            items={checkpoints}
            onChange={onModels}
          />
          <span className="mx-1 w-px shrink-0 self-stretch bg-line" />
          <FilterGroup
            label="LoRa"
            role="LoRA"
            kind="loras"
            chromeKey={`${chromePrefix}-loras`}
            style={style}
            chips={loras}
            items={loraItems}
            onChange={onLoras}
          />
          <span className="mx-1 w-px shrink-0 self-stretch bg-line" />
          <FilterGroup
            label="Wildcards"
            role="Wildcard"
            kind="wildcards"
            chromeKey={`${chromePrefix}-wildcards`}
            style={style}
            chips={wildcards}
            items={wildcardItems}
            onChange={onWildcards}
          />
        </div>
      </div>
    </div>
  )
}

function FilterGroup({
  label,
  role,
  kind,
  chromeKey,
  style,
  chips,
  items,
  onChange,
}: {
  label: string
  role: string
  kind: keyof ModelLists
  chromeKey: string
  style: ModelTileStyle
  chips: string[]
  items: ModelEntry[]
  onChange: (value: string[]) => void
}) {
  const spec = modelTileSpec(style)
  const scopeKey = useSettingsStore((s) => galleryScopeKey(chromeKey, s))
  const view = useThumbView(kind, scopeKey)
  const selected = selectedPaths(chips, items)
  const group = useRef<HTMLDivElement>(null)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)

  function showPicker(rect: DOMRect) {
    setAnchor(rect)
  }

  useEffect(() => {
    if (!anchor) {
      return
    }
    function onPointer(event: PointerEvent) {
      const node = event.target as Node | null
      if (group.current?.contains(node)) {
        return
      }
      if (node instanceof Element && node.closest('[data-overlay]')) {
        return
      }
      setAnchor(null)
    }
    window.addEventListener('pointerdown', onPointer, true)
    return () => window.removeEventListener('pointerdown', onPointer, true)
  }, [anchor])

  return (
    <div ref={group} className="flex shrink-0 flex-col gap-0.5">
      <RowLabel show={spec.overlay}>{label}</RowLabel>
      <div className={['flex', spec.gap].join(' ')}>
        {chips.map((chip) => {
          const item = findItem(items, chip)
          return (
            <FilterCard
              key={chip}
              style={style}
              role={role}
              name={displayName(item, chip)}
              src={modelThumbSrc(kind, item, view)}
              unresolved={!item}
              onOpen={showPicker}
              onClear={() => onChange(chips.filter((entry) => entry !== chip))}
            />
          )
        })}
        <FilterCard style={style} role={role} name={role} empty onOpen={showPicker} />
      </div>
      {anchor ? (
        <FloatingModelsView
          kind={kind}
          selected={selected}
          chromeKey={chromeKey}
          dismissOutside={false}
          closeOnSelect={false}
          anchor={anchor}
          onSelect={(path) => onChange(toggleChip(chips, path))}
          onClose={() => setAnchor(null)}
        />
      ) : null}
    </div>
  )
}

function FilterCard({
  style,
  role,
  name,
  src,
  empty = false,
  unresolved = false,
  onOpen,
  onClear,
}: {
  style: ModelTileStyle
  role: string
  name: string
  src?: string | null
  empty?: boolean
  unresolved?: boolean
  onOpen: (anchor: DOMRect) => void
  onClear?: () => void
}) {
  const box = useRef<HTMLDivElement>(null)

  return (
    <div ref={box}>
      <ModelTile
        style={style}
        role={role}
        name={name}
        src={src}
        empty={empty}
        unresolved={unresolved}
        onOpen={() => {
          const rect = box.current?.getBoundingClientRect()
          if (rect) {
            onOpen(rect)
          }
        }}
        onClear={empty ? undefined : onClear}
      />
    </div>
  )
}
