import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { ContextMenu, ContextMenuItem } from '@/components/composites/chrome/ContextMenu.tsx'
import type { GalleryLibrary } from '@/lib/api/gallery.ts'
import { useRef, useState, type DragEvent, type MouseEvent } from 'react'
import type { GallerySidebarId } from '@/views/gallery/panels/content/filters.ts'
import {
  canMove,
  childrenOf,
  dropOnItem,
  isFolder,
  placeIds,
  type LibraryDrop,
} from '@/views/gallery/panels/content/libraryTree.ts'

function rowClass(on: boolean, over: boolean) {
  return [
    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
    on ? 'bg-line text-ink' : 'text-muted hover:bg-field hover:text-ink',
    over ? 'bg-accent/20 text-ink' : '',
  ].join(' ')
}

export function GalleryLibraryTree({
  nav,
  libraries,
  onNav,
  onAdd,
  onAddFolder,
  onEdit,
  onRemove,
  onDrop,
}: {
  nav: GallerySidebarId
  libraries: GalleryLibrary[]
  onNav: (id: GallerySidebarId) => void
  onAdd: (parentId: string | null) => void
  onAddFolder: (parentId: string | null) => void
  onEdit: (library: GalleryLibrary) => void
  onRemove: (library: GalleryLibrary) => void
  onDrop: (parentId: string | null, ids: string[]) => void
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [menu, setMenu] = useState<{ x: number; y: number; library: GalleryLibrary | null } | null>(null)
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const dragRef = useRef<string | null>(null)

  function startDrag(event: DragEvent, ident: string) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', ident)
    dragRef.current = ident
    setDrag(ident)
  }

  function endDrag() {
    dragRef.current = null
    setDrag(null)
    setOver(null)
  }

  function applyDrop(src: string, dest: LibraryDrop) {
    if (!canMove(libraries, src, dest.parentId)) {
      return
    }
    onDrop(dest.parentId, placeIds(libraries, dest.parentId, src, dest.beforeId))
  }

  function renderRows(parentId: string | null, depth: number) {
    const rows = childrenOf(libraries, parentId)
    return rows.map((item, index) => {
      const folder = isFolder(item)
      const expanded = open[item.id] !== false
      const next = rows[index + 1]
      const ident = folder ? `folder:${item.id}` : `library:${item.id}`
      return (
        <div key={item.id}>
          <button
            type="button"
            draggable
            className={rowClass(nav === ident, over === item.id)}
            style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
            onClick={() => onNav(ident)}
            onContextMenu={(event: MouseEvent) => {
              event.preventDefault()
              setMenu({ x: event.clientX, y: event.clientY, library: item })
            }}
            onDragStart={(event) => startDrag(event, item.id)}
            onDragEnd={endDrag}
            onDragOver={(event) => {
              event.preventDefault()
              const src = dragRef.current || event.dataTransfer.getData('text/plain')
              const dest = dropOnItem(item, event.clientY, event.currentTarget.getBoundingClientRect().top, event.currentTarget.getBoundingClientRect().height, next?.id ?? null)
              const ok = Boolean(src && canMove(libraries, src, dest.parentId))
              event.dataTransfer.dropEffect = ok ? 'move' : 'none'
              setOver(ok ? item.id : null)
            }}
            onDrop={(event) => {
              event.preventDefault()
              const src = dragRef.current || event.dataTransfer.getData('text/plain')
              const rect = event.currentTarget.getBoundingClientRect()
              endDrag()
              if (!src) {
                return
              }
              applyDrop(src, dropOnItem(item, event.clientY, rect.top, rect.height, next?.id ?? null))
            }}
          >
            {folder ? (
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center"
                onClick={(event) => {
                  event.stopPropagation()
                  setOpen((value) => ({ ...value, [item.id]: value[item.id] === false }))
                }}
              >
                <AppIcon id={expanded ? 'chevron-down' : 'chevron-right'} size={10} />
              </span>
            ) : (
              <span className="w-4 shrink-0" />
            )}
            <AppIcon id={folder ? 'folder' : 'images'} size={14} />
            <span className={['min-w-0 truncate', drag === item.id ? 'opacity-40' : ''].join(' ')}>{item.name}</span>
          </button>
          {folder && expanded ? renderRows(item.id, depth + 1) : null}
        </div>
      )
    })
  }

  return (
    <div className="flex min-h-0 flex-col gap-0.5">
      <button
        type="button"
        className={rowClass(nav === 'libraries', over === 'root')}
        onClick={() => onNav('libraries')}
        onContextMenu={(event) => {
          event.preventDefault()
          setMenu({ x: event.clientX, y: event.clientY, library: null })
        }}
        onDragOver={(event) => {
          event.preventDefault()
          const src = dragRef.current || event.dataTransfer.getData('text/plain')
          const ok = Boolean(src && canMove(libraries, src, null))
          event.dataTransfer.dropEffect = ok ? 'move' : 'none'
          setOver(ok ? 'root' : null)
        }}
        onDrop={(event) => {
          event.preventDefault()
          const src = dragRef.current || event.dataTransfer.getData('text/plain')
          endDrag()
          if (src) {
            applyDrop(src, { parentId: null, beforeId: null })
          }
        }}
      >
        <AppIcon id="images" size={14} />
        All
      </button>
      {renderRows(null, 0)}
      <button type="button" className={rowClass(false, false)} onClick={() => onAdd(null)}>
        <AppIcon id="plus" size={14} />
        New gallery
      </button>
      <button type="button" className={rowClass(false, false)} onClick={() => onAddFolder(null)}>
        <AppIcon id="plus" size={14} />
        New folder
      </button>
      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <ContextMenuItem
            label="New gallery"
            icon="plus"
            onClick={() => {
              onAdd(menu.library && isFolder(menu.library) ? menu.library.id : menu.library?.parent_id ?? null)
              setMenu(null)
            }}
          />
          <ContextMenuItem
            label="New folder"
            icon="plus"
            onClick={() => {
              onAddFolder(menu.library && isFolder(menu.library) ? menu.library.id : menu.library?.parent_id ?? null)
              setMenu(null)
            }}
          />
          {menu.library ? (
            <>
              <ContextMenuItem
                label={isFolder(menu.library) ? 'Rename' : 'Edit'}
                icon="pencil"
                onClick={() => {
                  onEdit(menu.library!)
                  setMenu(null)
                }}
              />
              <ContextMenuItem
                label="Remove"
                danger
                onClick={() => {
                  onRemove(menu.library!)
                  setMenu(null)
                }}
              />
            </>
          ) : null}
        </ContextMenu>
      ) : null}
    </div>
  )
}
