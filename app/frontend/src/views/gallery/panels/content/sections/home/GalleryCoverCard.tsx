import { RotatingPreview } from '@/views/gallery/panels/content/sections/home/RotatingPreview.tsx'
import type { GalleryPreview } from '@/lib/api/gallery.ts'
import type { DragEvent, MouseEvent } from 'react'
import type { LibraryDropKind } from '@/views/gallery/panels/content/libraryTree.ts'

export function labelOf(name: string) {
  const slash = name.replaceAll('\\', '/').split('/').pop() || name
  return slash.replace(/\.safetensors$/i, '')
}

export function GalleryCoverCard({
  previews,
  title,
  subtitle,
  onClick,
  onContextMenu,
  draggable,
  dragging,
  dropKind,
  onDragStart,
  onDrag,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  previews: GalleryPreview[]
  title: string
  subtitle: string
  onClick: () => void
  onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void
  draggable?: boolean
  dragging?: boolean
  dropKind?: LibraryDropKind | null
  onDragStart?: (event: DragEvent<HTMLButtonElement>) => void
  onDrag?: (event: DragEvent<HTMLButtonElement>) => void
  onDragEnd?: (event: DragEvent<HTMLButtonElement>) => void
  onDragOver?: (event: DragEvent<HTMLButtonElement>) => void
  onDragLeave?: (event: DragEvent<HTMLButtonElement>) => void
  onDrop?: (event: DragEvent<HTMLButtonElement>) => void
}) {
  const dropMarker = dropKind === 'before' || dropKind === 'after' ? (
    <span
      aria-hidden="true"
      className={[
        'pointer-events-none absolute top-0.5 bottom-0.5 z-30 w-0.5 rounded-full bg-accent',
        dropKind === 'before' ? '-left-1' : '-right-1',
      ].join(' ')}
    />
  ) : null

  return (
    <div className="relative min-w-0">
      {dropMarker}
      <button
        type="button"
        draggable={draggable}
        className={[
          'flex min-w-0 w-full flex-col overflow-hidden rounded-md border bg-panel text-left hover:border-accent',
          draggable ? 'cursor-grab active:cursor-grabbing' : '',
          dragging ? 'opacity-20' : '',
          dropKind === 'into' ? 'border-accent' : 'border-line',
        ].join(' ')}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onDragStart={onDragStart}
        onDrag={onDrag}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="aspect-[4/5] w-full">
          <RotatingPreview items={previews} />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5 px-2 py-1.5">
          <span className="truncate text-sm text-ink">{title}</span>
          <span className="truncate text-xs text-muted">{subtitle}</span>
        </div>
      </button>
    </div>
  )
}
