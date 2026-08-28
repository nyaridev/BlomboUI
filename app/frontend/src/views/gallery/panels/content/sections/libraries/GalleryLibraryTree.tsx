import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { ContextMenu, ContextMenuItem } from '@/components/composites/chrome/ContextMenu.tsx'
import type { GalleryLibrary } from '@/lib/api/gallery.ts'
import { Fragment, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import type { GallerySidebarId } from '@/views/gallery/panels/content/filters.ts'
import {
  canMove,
  childrenOf,
  dropKind,
  dropOnItem,
  isFolder,
  placeIds,
  type LibraryDrop,
  type LibraryDropKind,
} from '@/views/gallery/panels/content/libraryTree.ts'

function rowClass(on: boolean, into: boolean) {
  return [
    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
    on ? 'bg-line text-ink' : 'text-muted hover:bg-field hover:text-ink',
    into ? 'bg-accent/20 text-ink' : '',
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
  const [over, setOver] = useState<{ id: string; kind: LibraryDropKind | 'root' } | null>(null)
  const dragRef = useRef<string | null>(null)
  const dragged = useRef(false)

  function startDrag(event: DragEvent, ident: string) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', ident)
    dragRef.current = ident
    dragged.current = false
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
        <Fragment key={item.id}>
          {over?.id === item.id && over.kind === 'before' ? (
            <span className="my-0.5 block h-0.5 rounded-full bg-accent" />
          ) : null}
          <button
            type="button"
            draggable
            className={[
              rowClass(nav === ident, over?.id === item.id && over.kind === 'into'),
              drag === item.id ? 'opacity-20' : '',
              'cursor-grab active:cursor-grabbing',
            ].join(' ')}
            style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
            onClick={() => {
              if (dragged.current) {
                return
              }
              onNav(ident)
            }}
            onContextMenu={(event: MouseEvent) => {
              event.preventDefault()
              setMenu({ x: event.clientX, y: event.clientY, library: item })
            }}
            onDragStart={(event) => startDrag(event, item.id)}
            onDrag={() => {
              dragged.current = true
            }}
            onDragEnd={endDrag}
            onDragOver={(event) => {
              event.preventDefault()
              const src = dragRef.current || event.dataTransfer.getData('text/plain')
              if (!src || src === item.id) {
                setOver(null)
                event.dataTransfer.dropEffect = 'none'
                return
              }
              const dest = dropOnItem(
                item,
                event.clientY,
                event.currentTarget.getBoundingClientRect().top,
                event.currentTarget.getBoundingClientRect().height,
                next?.id ?? null,
              )
              const ok = canMove(libraries, src, dest.parentId)
              event.dataTransfer.dropEffect = ok ? 'move' : 'none'
              const kind = ok ? dropKind(item, dest) : null
              setOver(kind ? { id: item.id, kind } : null)
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
            <span className="min-w-0 truncate">{item.name}</span>
          </button>
          {over?.id === item.id && over.kind === 'after' && !(folder && expanded) ? (
            <span className="my-0.5 block h-0.5 rounded-full bg-accent" />
          ) : null}
          {folder && expanded ? renderRows(item.id, depth + 1) : null}
          {over?.id === item.id && over.kind === 'after' && folder && expanded ? (
            <span className="my-0.5 block h-0.5 rounded-full bg-accent" />
          ) : null}
        </Fragment>
      )
    })
  }

  return (
    <div className="flex min-h-0 flex-col gap-0.5">
      <button
        type="button"
        className={rowClass(nav === 'libraries', false)}
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
          setOver(ok ? { id: 'root', kind: 'root' } : null)
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
      {over?.kind === 'root' ? <span className="my-0.5 block h-0.5 rounded-full bg-accent" /> : null}
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
