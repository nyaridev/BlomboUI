import { AppIcon } from '@/components/AppIcon.tsx'
import { ContextMenu, ContextMenuItem } from '@/components/ContextMenu.tsx'
import { displayToIdent, LOCAL_DIR, parentIdent, type GalleryNode } from '@/lib/galleryTree.ts'
import { useRef, useState, type DragEvent, type MouseEvent } from 'react'

function rowClass(on: boolean) {
  return [
    'flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
    on ? 'bg-line text-ink' : 'text-muted hover:bg-field hover:text-ink',
  ].join(' ')
}

function canDrop(src: string, dest: string) {
  if (!src || dest === src) {
    return false
  }
  if (dest.startsWith(`${src}/`)) {
    return false
  }
  return parentIdent(src) !== dest
}

export function GalleryTree({
  roots,
  query,
  openDirs,
  extraNames,
  fileOps,
  externalDrag,
  fileOn,
  fileLabel,
  onClickDir,
  onClickFile,
  onMove,
  onRename,
  onReveal,
  onRemove,
  onAdd,
}: {
  roots: GalleryNode[]
  query: string
  openDirs: Set<string>
  extraNames: string[]
  fileOps: boolean
  externalDrag?: string | null
  fileOn: (path: string) => boolean
  fileLabel: (path: string, name: string) => string
  onClickDir: (path: string) => void
  onClickFile?: (path: string) => void
  onMove: (path: string, folder: string) => void
  onRename: (path: string, name: string) => void
  onReveal: (path: string) => void
  onRemove: (path: string) => void
  onAdd: (folder: string) => void
}) {
  const [drag, setDrag] = useState<string | null>(null)
  const [drop, setDrop] = useState<string | null>(null)
  const [menu, setMenu] = useState<{
    x: number
    y: number
    path: string
    name: string
    kind: 'dir' | 'file'
    root: boolean
  } | null>(null)
  const dragRef = useRef<string | null>(null)

  function isRoot(path: string) {
    return path === LOCAL_DIR || extraNames.includes(path)
  }

  function dragIdent(event: DragEvent) {
    return dragRef.current || externalDrag || event.dataTransfer.getData('text/plain') || drag || ''
  }

  function setTarget(event: DragEvent, destDisplay: string) {
    event.preventDefault()
    event.stopPropagation()
    const src = dragIdent(event)
    const dest = displayToIdent(destDisplay)
    const ok = src && canDrop(src, dest)
    event.dataTransfer.dropEffect = ok ? 'move' : 'none'
    setDrop(ok ? destDisplay : null)
  }

  function dropOn(event: DragEvent, destDisplay: string) {
    event.preventDefault()
    event.stopPropagation()
    const src = dragIdent(event)
    dragRef.current = null
    setDrag(null)
    setDrop(null)
    const dest = displayToIdent(destDisplay)
    if (src && canDrop(src, dest)) {
      onMove(src, dest)
    }
  }

  function startDrag(event: DragEvent, ident: string) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', ident)
    dragRef.current = ident
    setDrag(ident)
    setDrop(null)
  }

  function openMenu(event: MouseEvent, node: GalleryNode, root: boolean) {
    if (!fileOps) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    setMenu({
      x: event.clientX,
      y: event.clientY,
      path: node.path,
      name: node.name,
      kind: node.kind,
      root,
    })
  }

  function renderNode(node: GalleryNode, depth = 0) {
    const root = isRoot(node.path)
    if (node.kind === 'file') {
      const on = fileOn(node.path)
      const ident = displayToIdent(node.path)
      return (
        <button
          key={node.path}
          type="button"
          title={node.path}
          draggable={fileOps}
          className={[rowClass(on), drag === ident ? 'opacity-40' : ''].join(' ')}
          onClick={() => onClickFile?.(node.path)}
          onContextMenu={(event) => openMenu(event, node, false)}
          onDragStart={(event) => {
            if (!fileOps) {
              event.preventDefault()
              return
            }
            startDrag(event, ident)
          }}
          onDragEnd={() => {
            dragRef.current = null
            setDrag(null)
            setDrop(null)
          }}
          onDragOver={(event) => setTarget(event, parentIdent(ident) ? node.path.slice(0, node.path.lastIndexOf('/')) : LOCAL_DIR)}
          onDrop={(event) =>
            dropOn(event, parentIdent(ident) ? node.path.slice(0, node.path.lastIndexOf('/')) : LOCAL_DIR)
          }
        >
          <span className="w-4 shrink-0" />
          <span className="shrink-0 text-muted">
            <AppIcon id="file" />
          </span>
          <span className="truncate">{fileLabel(node.path, node.name)}</span>
        </button>
      )
    }
    const open = openDirs.has(node.path)
    const on = query.trim() === node.path
    const over = drop === node.path
    return (
      <div
        key={node.path || node.name}
        className={[
          'shrink-0 rounded-md border',
          on ? 'border-accent' : 'border-line',
          depth % 2 === 0 ? 'tree-dir' : 'tree-dir-alt',
        ].join(' ')}
        onDragOver={(event) => setTarget(event, node.path)}
        onDrop={(event) => dropOn(event, node.path)}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node)) {
            return
          }
          if (drop === node.path) {
            setDrop(null)
          }
        }}
      >
        <div
          className={[
            'tree-dir-bar flex w-full min-w-0 items-center rounded-t',
            over ? 'is-drop' : on ? 'is-on text-ink' : 'text-muted',
          ].join(' ')}
        >
          <button
            type="button"
            title={node.path}
            draggable={fileOps && !root}
            className={[
              'flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm outline-none hover:text-ink',
              on ? 'text-ink' : '',
            ].join(' ')}
            onClick={() => onClickDir(node.path)}
            onContextMenu={(event) => openMenu(event, node, root)}
            onDragStart={(event) => {
              if (!fileOps || root) {
                event.preventDefault()
                return
              }
              startDrag(event, displayToIdent(node.path))
            }}
            onDragEnd={() => {
              dragRef.current = null
              setDrag(null)
              setDrop(null)
            }}
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              <AppIcon id={open ? 'chevron-down' : 'chevron-right'} size={10} />
            </span>
            <span className="shrink-0">
              <AppIcon id="folder" />
            </span>
            <span className="truncate font-medium">{node.name}</span>
          </button>
        </div>
        {open ? (
          <div className="flex flex-col gap-1 border-t border-line p-1.5 pl-3">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        ) : null}
      </div>
    )
  }

  if (roots.length === 0) {
    return <p className="text-xs text-muted">No matching files.</p>
  }
  return (
    <>
      <div className="flex flex-col gap-1.5">{roots.map((node) => renderNode(node))}</div>
      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          {menu.kind === 'dir' ? (
            <ContextMenuItem
              label="New folder"
              onClick={() => {
                setMenu(null)
                onAdd(menu.path)
              }}
            />
          ) : null}
          {menu.root ? null : (
            <ContextMenuItem
              label="Rename"
              onClick={() => {
                setMenu(null)
                onRename(menu.path, menu.name)
              }}
            />
          )}
          <ContextMenuItem
            label="Show in Explorer"
            onClick={() => {
              setMenu(null)
              onReveal(menu.path)
            }}
          />
          {menu.root ? null : (
            <ContextMenuItem
              label="Remove"
              danger
              onClick={() => {
                setMenu(null)
                onRemove(menu.path)
              }}
            />
          )}
        </ContextMenu>
      ) : null}
    </>
  )
}
