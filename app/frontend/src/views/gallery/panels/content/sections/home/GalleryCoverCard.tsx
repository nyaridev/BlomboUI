import { RotatingPreview } from '@/views/gallery/panels/content/sections/home/RotatingPreview.tsx'
import type { GalleryPreview } from '@/lib/api/gallery.ts'
import type { DragEvent, MouseEvent } from 'react'

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
  dropReady,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  previews: GalleryPreview[]
  title: string
  subtitle: string
  onClick: () => void
  onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void
  draggable?: boolean
  dropReady?: boolean
  onDragStart?: (event: DragEvent<HTMLButtonElement>) => void
  onDragEnd?: (event: DragEvent<HTMLButtonElement>) => void
  onDragOver?: (event: DragEvent<HTMLButtonElement>) => void
  onDrop?: (event: DragEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      draggable={draggable}
      className={[
        'flex min-w-0 flex-col overflow-hidden rounded-md border bg-panel text-left hover:border-accent',
        dropReady ? 'border-accent' : 'border-line',
      ].join(' ')}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
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
  )
}
