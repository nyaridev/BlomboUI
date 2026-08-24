import { useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { ContextMenu, ContextMenuItem } from '@/components/chrome/ContextMenu.tsx'
import type { WildcardTreeNode } from '@/lib/api.ts'

function parentPath(path: string) {
  const cut = path.lastIndexOf('/')
  return cut >= 0 ? path.slice(0, cut) : ''
}

function canDrop(src: string, dest: string) {
  if (!src || dest === src) {
    return false
  }
  if (dest.startsWith(src + '/')) {
    return false
  }
  return parentPath(src) !== dest
}

function rowClass(on: boolean) {
  return [
    'flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
    on ? 'bg-line text-ink' : 'text-muted hover:bg-field hover:text-ink',
  ].join(' ')
}

export function filterWildcardTree(nodes: WildcardTreeNode[], query: string): WildcardTreeNode[] {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return nodes
  }
  const out: WildcardTreeNode[] = []
  for (const node of nodes) {
    const hit = node.name.toLowerCase().includes(needle) || node.path.toLowerCase().includes(needle)
    if (node.kind === 'file') {
      if (hit) {
        out.push(node)
      }
      continue
    }
    if (hit) {
      out.push(node)
      continue
    }
    const children = filterWildcardTree(node.children || [], query)
    if (children.length) {
      out.push({ ...node, children })
    }
  }
  return out
}

export function WildcardTree({
  roots,
  filePath,
  folderPath,
  openDirs,
  onToggleDir,
  onSelectFile,
  onSelectFolder,
  onMove,
  onRename,
  onReveal,
  onRemove,
  onAdd,
}: {
  roots: WildcardTreeNode[]
  filePath: string | null
  folderPath: string | null
  openDirs: Set<string>
  onToggleDir: (path: string) => void
  onSelectFile: (path: string) => void
  onSelectFolder: (path: string) => void
  onMove: (path: string, folder: string) => void
  onRename: (path: string, name: string) => void
  onReveal: (path: string) => void
  onRemove: (path: string) => void
  onAdd: (folder: string) => void
}) {
  const [drag, setDrag] = useState<string | null>(null)
  const [drop, setDrop] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; path: string; name: string; root: boolean } | null>(null)
  const dragRef = useRef<string | null>(null)

  function dragPath(event: DragEvent) {
    return dragRef.current || event.dataTransfer.getData('text/plain') || drag || ''
  }

  function setTarget(event: DragEvent, dest: string) {
    event.preventDefault()
    event.stopPropagation()
    const src = dragPath(event)
    event.dataTransfer.dropEffect = src && canDrop(src, dest) ? 'move' : 'none'
    setDrop(src && canDrop(src, dest) ? dest : null)
  }

  function dropOn(event: DragEvent, dest: string) {
    event.preventDefault()
    event.stopPropagation()
    const src = dragPath(event)
    dragRef.current = null
    setDrag(null)
    setDrop(null)
    if (src && canDrop(src, dest)) {
      onMove(src, dest)
    }
  }

  function startDrag(event: DragEvent, path: string) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', path)
    dragRef.current = path
    setDrag(path)
    setDrop(null)
  }

  function openMenu(event: MouseEvent, node: WildcardTreeNode, root: boolean) {
    event.preventDefault()
    event.stopPropagation()
    setMenu({ x: event.clientX, y: event.clientY, path: node.path, name: node.name, root })
  }

  function renderNode(node: WildcardTreeNode, depth = 0) {
    const root = depth === 0
    if (node.kind === 'file') {
      const on = filePath === node.path
      return (
        <button
          key={node.path}
          type="button"
          title={node.path}
          draggable
          className={[rowClass(on), drag === node.path ? 'opacity-40' : ''].join(' ')}
          onClick={() => onSelectFile(node.path)}
          onContextMenu={(event) => openMenu(event, node, false)}
          onDragStart={(event) => startDrag(event, node.path)}
          onDragEnd={() => {
            dragRef.current = null
            setDrag(null)
            setDrop(null)
          }}
          onDragOver={(event) => setTarget(event, parentPath(node.path))}
          onDrop={(event) => dropOn(event, parentPath(node.path))}
        >
          <span className="w-4 shrink-0" />
          <span className="shrink-0 text-muted">
            <AppIcon id="file" />
          </span>
          <span className="truncate">{node.name}</span>
        </button>
      )
    }
    const open = openDirs.has(node.path)
    const on = folderPath === node.path
    const over = drop === node.path
    return (
      <div
        key={node.path || node.name}
        className={[
          'shrink-0 rounded-md border border-line',
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
            title={node.path || node.name}
            draggable={!root}
            className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm outline-none hover:text-ink"
            onClick={() => {
              onSelectFolder(node.path)
              if (!open || on) {
                onToggleDir(node.path)
              }
            }}
            onContextMenu={(event) => openMenu(event, node, root)}
            onDragStart={(event) => {
              if (root) {
                event.preventDefault()
                return
              }
              startDrag(event, node.path)
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
          <button
            type="button"
            className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-sm text-muted hover:bg-line hover:text-ink"
            aria-label={`Add in ${node.name}`}
            title="Add folder or wildcard"
            onClick={(event) => {
              event.stopPropagation()
              onAdd(node.path)
            }}
          >
            <AppIcon id="plus" size={14} />
          </button>
        </div>
        {open ? (
          <div className="flex flex-col gap-1 border-t border-line p-1.5 pl-3">
            {(node.children || []).map((child) => renderNode(child, depth + 1))}
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
