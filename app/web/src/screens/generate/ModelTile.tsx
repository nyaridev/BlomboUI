import { AppIcon } from '@/components/AppIcon.tsx'
import { TilePreview, TILE_GLOW } from '@/components/TilePreview.tsx'
import { modelTileSpec, type ModelTileStyle } from './modelLayouts.ts'

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
}) {
  const spec = modelTileSpec(style)
  const title = empty ? `Add ${role}` : name

  if (spec.text) {
    return (
      <div
        className={[
          'group flex h-5 overflow-hidden rounded border',
          warn ? 'border-red bg-red/15' : active ? `border-line bg-field ${TILE_GLOW}` : 'border-line bg-field',
        ].join(' ')}
      >
        <button
          type="button"
          className={[
            'flex h-full min-w-[8rem] max-w-[14rem] items-center text-left text-xs text-ink',
            empty ? 'gap-1 pl-1 pr-2' : 'gap-1.5 px-2',
            warn ? 'hover:bg-red/25' : 'hover:bg-line',
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
          {badge ? <span className={['shrink-0 tabular-nums leading-4', warn ? 'text-red-bright' : 'text-muted'].join(' ')}>{badge}</span> : null}
        </button>
        {onClear ? (
          <button
            type="button"
            className="flex w-0 shrink-0 items-center justify-center overflow-hidden text-muted transition-[width] duration-200 ease-out group-hover:w-6 hover:bg-red hover:text-ink"
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
    )
  }

  return (
    <div className="group relative shrink-0">
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
          className="pointer-events-none absolute top-1 right-1 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-bg/85 text-muted opacity-0 shadow-sm scale-75 transition duration-150 ease-out group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100 hover:bg-red hover:text-ink hover:scale-110"
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
  )
}
