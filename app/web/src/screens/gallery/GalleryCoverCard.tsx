import { RotatingPreview } from './RotatingPreview.tsx'
import type { GalleryPreview } from '@/lib/api/gallery.ts'
import type { MouseEvent } from 'react'

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
}: {
  previews: GalleryPreview[]
  title: string
  subtitle: string
  onClick: () => void
  onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      className="flex flex-col overflow-hidden rounded-md border border-line bg-panel text-left hover:border-accent"
      onClick={onClick}
      onContextMenu={onContextMenu}
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
