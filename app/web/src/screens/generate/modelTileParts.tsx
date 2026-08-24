import { modelThumbSrc } from '@/lib/gallery/thumbView.ts'
import type { ModelEntry, ModelLists } from '@/lib/api.ts'
import { modelPath } from '@/stores/modelsStore.ts'
import type { ModelSwap } from '@/stores/generateStore.ts'
import type { DragEvent, ReactNode } from 'react'
import { ModelTile } from './ModelTile.tsx'
import type { ModelTileStyle } from './modelLayouts.ts'
import { displayName } from './modelTileUtils.ts'
import type { GenerateTab } from './tabs.ts'

const LABEL = 'truncate px-0.5 text-[10px] uppercase tracking-wide text-muted'

export function RowLabel({
  show,
  width,
  title,
  children,
}: {
  show: boolean
  width?: string
  title?: string
  children: ReactNode
}) {
  return (
    <span
      className={[
        LABEL,
        'min-w-0 overflow-hidden transition-[max-height,opacity,width] duration-300 ease-out motion-reduce:transition-none',
        show ? ['max-h-4 opacity-100', width || ''].join(' ') : 'max-h-0 w-0 px-0 opacity-0',
      ].join(' ')}
      title={title}
    >
      {children}
    </span>
  )
}

export function Tile({
  style,
  tile,
  onOpen,
  active,
}: {
  style: ModelTileStyle
  tile: TileSpec
  onOpen: () => void
  active: boolean
}) {
  return (
    <ModelTile
      style={style}
      role={tile.role}
      name={tile.name}
      src={tile.src}
      empty={tile.empty}
      unresolved={tile.unresolved}
      badge={tile.badge}
      warn={tile.warn}
      onOpen={onOpen}
      onClear={tile.onClear}
      active={active}
      draggable={Boolean(tile.dragId)}
      dragging={tile.dragging}
      dropPosition={tile.dropPosition}
      onDragStart={tile.onDragStart}
      onDragOver={tile.onDragOver}
      onDrop={tile.onDrop}
      onDragEnd={tile.onDragEnd}
      strengthControl={tile.strengthControl}
      showStrengthControl={tile.showStrengthControl}
    />
  )
}

export type Group = {
  id: string
  tab: GenerateTab
  label?: string
  labelEach?: boolean
  tiles: TileSpec[]
}

export type TileSpec = {
  key: string
  role: string
  name: string
  swap: ModelSwap
  src?: string | null
  empty?: boolean
  unresolved?: boolean
  badge?: string
  warn?: boolean
  onClear?: () => void
  dragId?: string
  dragging?: boolean
  dropPosition?: 'before' | 'after'
  onDragStart?: (event: DragEvent<HTMLElement>) => void
  onDragOver?: (event: DragEvent<HTMLElement>) => void
  onDrop?: (event: DragEvent<HTMLElement>) => void
  onDragEnd?: () => void
  strengthControl?: ReactNode
  showStrengthControl?: boolean
}

export function slotTile(
  role: string,
  value: string,
  items: ModelEntry[],
  kind: keyof ModelLists,
  onClear: (value: string) => void,
  swap: ModelSwap,
): TileSpec {
  if (!value.trim()) {
    return { key: `${role}-empty`, role, name: role, empty: true, swap }
  }
  const item = items.find((row) => modelPath(row) === value) ?? null
  return {
    key: `${role}-${value}`,
    role,
    name: displayName(item, value),
    src: thumbSrc(kind, item),
    unresolved: !item,
    onClear: () => onClear(''),
    swap,
  }
}

export function promptTile(
  role: string,
  tagName: string,
  item: ModelEntry | null,
  kind: keyof ModelLists,
  index: number,
  swap: ModelSwap,
  onClear: () => void,
  badge?: string,
  warn?: boolean,
): TileSpec {
  return {
    key: `${role}-${index}-${tagName}`,
    role,
    name: displayName(item, tagName),
    src: thumbSrc(kind, item),
    unresolved: !item,
    badge,
    warn,
    onClear,
    swap,
  }
}

export function emptyTile(role: string, swap: ModelSwap): TileSpec {
  return { key: `${role}-add`, role, name: role, empty: true, swap }
}

function thumbSrc(kind: keyof ModelLists, item: ModelEntry | null) {
  return modelThumbSrc(kind, item)
}
