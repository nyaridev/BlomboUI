import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { ContextMenu, ContextMenuItem } from '@/components/composites/chrome/ContextMenu.tsx'
import type { GalleryLibrary } from '@/lib/api/gallery.ts'
import { useRef, useState, type DragEvent } from 'react'
import { GalleryCoverCard } from '@/views/gallery/panels/content/sections/home/GalleryCoverCard.tsx'
import { canMove, childrenOf, dropOnItem, isFolder, placeIds } from '@/views/gallery/panels/content/libraryTree.ts'

export function GalleryLibraries({
  items,
  parentId,
  trail,
  onOpen,
  onOpenFolder,
  onTrail,
  onAdd,
  onAddFolder,
  onEdit,
  onRemove,
  onDrop,
}: {
  items: GalleryLibrary[]
  parentId: string | null
  trail: GalleryLibrary[]
  onOpen: (library: GalleryLibrary) => void
  onOpenFolder: (library: GalleryLibrary) => void
  onTrail: (id: string | null) => void
  onAdd: () => void
  onAddFolder: () => void
  onEdit: (library: GalleryLibrary) => void
  onRemove: (library: GalleryLibrary) => void
  onDrop: (parentId: string | null, ids: string[]) => void
}) {
  const [menu, setMenu] = useState<{ x: number; y: number; library: GalleryLibrary } | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const dragRef = useRef<string | null>(null)
  const shown = childrenOf(items, parentId)

  function startDrag(event: DragEvent, ident: string) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', ident)
    dragRef.current = ident
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1 text-sm">
        <button type="button" className="text-muted hover:text-ink" onClick={() => onTrail(null)}>
          Galleries
        </button>
        {trail.map((item) => (
          <span key={item.id} className="flex items-center gap-1">
            <span className="text-muted">/</span>
            <button type="button" className="text-ink" onClick={() => onTrail(item.id)}>
              {item.name}
            </button>
          </span>
        ))}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
        {shown.map((item, index) => {
          const next = shown[index + 1]
          return (
            <GalleryCoverCard
              key={item.id}
              previews={item.previews}
              title={item.name}
              subtitle={isFolder(item) ? 'Folder' : item.query || 'Saved search'}
              draggable
              dropReady={over === item.id}
              onClick={() => (isFolder(item) ? onOpenFolder(item) : onOpen(item))}
              onContextMenu={(event) => {
                event.preventDefault()
                setMenu({ x: event.clientX, y: event.clientY, library: item })
              }}
              onDragStart={(event) => startDrag(event, item.id)}
              onDragEnd={() => {
                dragRef.current = null
                setOver(null)
              }}
              onDragOver={(event) => {
                event.preventDefault()
                const src = dragRef.current || event.dataTransfer.getData('text/plain')
                const dest = dropOnItem(
                  item,
                  event.clientY,
                  event.currentTarget.getBoundingClientRect().top,
                  event.currentTarget.getBoundingClientRect().height,
                  next?.id ?? null,
                )
                const ok = Boolean(src && canMove(items, src, dest.parentId))
                event.dataTransfer.dropEffect = ok ? 'move' : 'none'
                setOver(ok ? item.id : null)
              }}
              onDrop={(event) => {
                event.preventDefault()
                const src = dragRef.current || event.dataTransfer.getData('text/plain')
                const rect = event.currentTarget.getBoundingClientRect()
                dragRef.current = null
                setOver(null)
                if (!src) {
                  return
                }
                const dest = dropOnItem(item, event.clientY, rect.top, rect.height, next?.id ?? null)
                if (canMove(items, src, dest.parentId)) {
                  onDrop(dest.parentId, placeIds(items, dest.parentId, src, dest.beforeId))
                }
              }}
            />
          )
        })}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="flex h-20 min-w-0 flex-1 items-center justify-center gap-2 rounded-md border border-dashed border-line text-sm text-muted hover:border-accent hover:text-ink"
          onClick={onAdd}
        >
          <AppIcon id="plus" size={16} />
          New gallery
        </button>
        <button
          type="button"
          className="flex h-20 min-w-0 flex-1 items-center justify-center gap-2 rounded-md border border-dashed border-line text-sm text-muted hover:border-accent hover:text-ink"
          onClick={onAddFolder}
        >
          <AppIcon id="plus" size={16} />
          New folder
        </button>
      </div>
      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <ContextMenuItem
            label={isFolder(menu.library) ? 'Rename' : 'Edit'}
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
