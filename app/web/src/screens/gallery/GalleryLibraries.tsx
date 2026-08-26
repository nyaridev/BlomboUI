import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { ContextMenu, ContextMenuItem } from '@/components/chrome/ContextMenu.tsx'
import type { GalleryLibrary } from '@/lib/api/gallery.ts'
import { useState } from 'react'
import { GalleryCoverCard } from './GalleryCoverCard.tsx'

export function GalleryLibraries({
  items,
  onOpen,
  onAdd,
  onEdit,
  onRemove,
}: {
  items: GalleryLibrary[]
  onOpen: (library: GalleryLibrary) => void
  onAdd: () => void
  onEdit: (library: GalleryLibrary) => void
  onRemove: (library: GalleryLibrary) => void
}) {
  const [menu, setMenu] = useState<{ x: number; y: number; library: GalleryLibrary } | null>(null)

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-ink">Galleries</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
        {items.map((item) => (
          <GalleryCoverCard
            key={item.id}
            previews={item.previews}
            title={item.name}
            subtitle={item.query || 'Saved search'}
            onClick={() => onOpen(item)}
            onContextMenu={(event) => {
              event.preventDefault()
              setMenu({ x: event.clientX, y: event.clientY, library: item })
            }}
          />
        ))}
      </div>
      <button
        type="button"
        className="flex h-20 items-center justify-center gap-2 rounded-md border border-dashed border-line text-sm text-muted hover:border-accent hover:text-ink"
        onClick={onAdd}
      >
        <AppIcon id="plus" size={16} />
        New gallery
      </button>
      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <ContextMenuItem
            label="Edit"
            icon="pencil"
            onClick={() => {
              onEdit(menu.library)
              setMenu(null)
            }}
          />
          <ContextMenuItem
            label="Remove"
            danger
            onClick={() => {
              onRemove(menu.library)
              setMenu(null)
            }}
          />
        </ContextMenu>
      ) : null}
    </div>
  )
}
