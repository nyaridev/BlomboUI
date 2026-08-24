import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { TilePreview, TILE_GLOW } from '@/components/models/TilePreview.tsx'
import { modelTileSpec, type ModelTileStyle } from './modelLayouts.ts'
import type { DragEvent, ReactNode } from 'react'

export function ModelTile({
  style,
  role,
  name,
  src,
  empty = false,
  unresolved = false,
  badge,
  warn = false,
  onOpen,
  onClear,
  active = false,
  draggable = false,
  dragging = false,
  dropPosition,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  strengthControl,
  showStrengthControl = false,
}: {
  style: ModelTileStyle
  role: string
  name: string
  src?: string | null
  empty?: boolean
  unresolved?: boolean
  badge?: string
  warn?: boolean
  onOpen: () => void
  onClear?: () => void
  active?: boolean
  draggable?: boolean
  dragging?: boolean
  dropPosition?: 'before' | 'after'
  onDragStart?: (event: DragEvent<HTMLElement>) => void
  onDragOver?: (event: DragEvent<HTMLElement>) => void
  onDrop?: (event: DragEvent<HTMLElement>) => void
  onDragEnd?: () => void
  strengthControl?: ReactNode
  showStrengthControl?: boolean
}) {
  const spec = modelTileSpec(style)
  const title = empty ? `Add ${role}` : name
  const dragClasses = [
    'transition-opacity duration-150 ease-out motion-reduce:transition-none',
    dragging ? 'opacity-20' : '',
  ].join(' ')
  const dropMarker = dropPosition ? (
    <span
      aria-hidden="true"
      className={[
        'pointer-events-none absolute top-0.5 bottom-0.5 z-30 w-0.5 rounded-full bg-accent',
        dropPosition === 'before' ? '-left-1' : '-right-1',
      ].join(' ')}
    />
  ) : null
  const strengthWidth = spec.text ? 'w-full min-w-0' : spec.width
  const strengthFooter = strengthControl ? (
    <div
      className={[
        'grid min-w-0 transition-[grid-template-rows,opacity,margin] duration-200 ease-out motion-reduce:transition-none',
        strengthWidth,
        showStrengthControl ? 'mt-0.5 grid-rows-[1fr] opacity-100' : 'pointer-events-none grid-rows-[0fr] opacity-0',
      ].join(' ')}
    >
      <div className="min-h-0 min-w-0 overflow-hidden">{strengthControl}</div>
    </div>
  ) : null

  if (spec.text) {
    return (
      <div className="relative shrink-0">
        {dropMarker}
        <div
          className={[
            'group relative flex h-5 overflow-hidden rounded border',
            draggable ? 'cursor-grab active:cursor-grabbing' : '',
            dragClasses,
            warn ? 'border-red bg-red/25' : active ? `border-line bg-field ${TILE_GLOW}` : 'border-line bg-field',
          ].join(' ')}
          draggable={draggable}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
        >
          <button
            type="button"
            className={[
              'flex h-full min-w-[8rem] max-w-[14rem] items-center text-left text-xs',
              empty ? 'gap-1 pl-1 pr-2' : 'gap-1.5 px-2',
              warn ? 'text-red' : 'text-ink',
              warn ? 'hover:bg-red/35' : 'hover:bg-line',
            ].join(' ')}
            title={title}
            onClick={onOpen}
          >
            {empty ? (
              <span className="shrink-0 text-muted">
                <AppIcon id="plus" size={12} />
              </span>
            ) : (
              <span className="shrink-0 text-[10px] leading-4 uppercase tracking-wide text-muted">{unresolved ? '?' : role}</span>
            )}
            <span className="min-w-0 truncate leading-4">{empty ? role : name}</span>
            {badge ? <span className={['ml-auto shrink-0 tabular-nums leading-4', warn ? 'text-red' : 'text-muted'].join(' ')}>{badge}</span> : null}
          </button>
          {onClear ? (
            <button
              type="button"
              className="flex aspect-square h-5 w-0 shrink-0 items-center justify-center overflow-hidden rounded bg-bg/70 text-muted transition-[width] duration-200 ease-out group-hover:w-5 hover:bg-red hover:text-ink"
              aria-label={`Clear ${role}`}
              title={`Clear ${role}`}
              onClick={onClear}
            >
              <span className="scale-75">
                <AppIcon id="x" size={12} />
              </span>
            </button>
          ) : null}
        </div>
        {strengthFooter}
      </div>
    )
  }

  return (
    <div className="relative shrink-0">
      {dropMarker}
      <div
        className={['group relative', draggable ? 'cursor-grab active:cursor-grabbing' : '', dragClasses].join(' ')}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
      >
        <button
          type="button"
          className={['relative block transition duration-150 ease-out group-hover:brightness-110', active ? TILE_GLOW : ''].join(' ')}
          title={title}
          onClick={onOpen}
        >
          <TilePreview
            src={empty || unresolved ? null : src}
            mark={empty ? '' : unresolved ? '?' : ''}
            label={spec.overlay && !empty ? name : undefined}
            badge={!empty && badge ? badge : undefined}
            warn={warn}
            eager
            glow={active}
            className={[
              spec.width,
              'transition-[width] duration-300 ease-out motion-reduce:transition-none',
              '[&_img]:origin-center [&_img]:transition-transform [&_img]:duration-200 [&_img]:ease-out group-hover:[&_img]:scale-110',
            ].join(' ')}
            preventMediaDrag={draggable}
          />
          {empty ? (
            <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-muted">
              <AppIcon id="plus" size={style === 'compact' ? 14 : 18} />
            </span>
          ) : null}
        </button>
        {onClear ? (
          <button
            type="button"
            className="pointer-events-none absolute top-1 right-1 z-20 flex aspect-square h-5 w-5 items-center justify-center rounded bg-bg/70 text-muted opacity-0 scale-75 transition duration-150 ease-out group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100 hover:bg-red hover:text-ink hover:scale-110"
            aria-label={`Clear ${role}`}
            title={`Clear ${role}`}
            onClick={onClear}
          >
            <span className="scale-75">
              <AppIcon id="x" size={12} />
            </span>
          </button>
        ) : null}
      </div>
      {strengthFooter}
    </div>
  )
}
