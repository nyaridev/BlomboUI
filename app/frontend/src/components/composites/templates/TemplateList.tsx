import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { ContextMenu, ContextMenuItem } from '@/components/composites/chrome/ContextMenu.tsx'
import { GlyphMark } from '@/components/composites/chrome/GlyphMark.tsx'
import { glyphOf } from '@/components/composites/chrome/glyph.ts'
import { IconButton } from '@/components/controls/button/IconButton.tsx'
import type { TemplateInfo } from '@/lib/api.ts'
import { Fragment, useRef, useState } from 'react'

type Menu = { x: number; y: number; id: string }

type TemplateListProps = {
  items: TemplateInfo[]
  selectedId: string
  onSelect: (id: string) => void
  onToggle: (id: string, enabled: boolean) => void
  onReorder: (ids: string[]) => void
  onRename: (id: string) => void
  onDelete: (id: string) => void
  onCreate: () => void
}

export function TemplateList({
  items,
  selectedId,
  onSelect,
  onToggle,
  onReorder,
  onRename,
  onDelete,
  onCreate,
}: TemplateListProps) {
  const customs = items.filter((item) => !item.builtin)
  const [drag, setDrag] = useState<number | null>(null)
  const [slot, setSlot] = useState<number | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  const dragged = useRef(false)

  function moving() {
    return drag !== null && slot !== null && slot !== drag && slot !== drag + 1
  }

  function applyDrop() {
    if (!moving() || drag === null || slot === null) {
      return
    }
    const next = [...customs]
    const [item] = next.splice(drag, 1)
    next.splice(drag < slot ? slot - 1 : slot, 0, item)
    onReorder(next.map((entry) => entry.id))
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col overflow-hidden rounded-md border border-line bg-bg">
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-1.5">
        {items
          .filter((item) => item.builtin)
          .map((item) => (
            <button
              key={item.id}
              type="button"
              className={rowClass(item.id === selectedId)}
              onClick={() => onSelect(item.id)}
            >
              <GlyphMark value={glyphOf(item)} size={16} />
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
            </button>
          ))}
        {customs.length ? <div className="my-1 border-t border-line" /> : null}
        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            applyDrop()
            setDrag(null)
            setSlot(null)
          }}
        >
          {customs.map((item, index) => (
            <Fragment key={item.id}>
              {moving() && slot === index ? <span className="mb-0.5 block h-0.5 rounded-full bg-accent" /> : null}
              <div
                draggable
                className={[
                  'flex items-center gap-0.5 rounded',
                  drag === index ? 'opacity-20' : '',
                ].join(' ')}
                onDragStart={() => {
                  dragged.current = false
                  setDrag(index)
                }}
                onDrag={() => {
                  dragged.current = true
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
                  const before = event.clientY < box.top + box.height / 2
                  setSlot(before ? index : index + 1)
                }}
                onDragEnd={() => {
                  applyDrop()
                  setDrag(null)
                  setSlot(null)
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setMenu({ x: event.clientX, y: event.clientY, id: item.id })
                }}
              >
                <button
                  type="button"
                  className={['min-w-0 flex-1', rowClass(item.id === selectedId)].join(' ')}
                  onClick={() => {
                    if (dragged.current) {
                      return
                    }
                    onSelect(item.id)
                  }}
                >
                  <GlyphMark value={glyphOf(item)} size={16} />
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                </button>
                <IconButton
                  tone="ghost"
                  aria-label={item.enabled === false ? 'Enable template' : 'Disable template'}
                  title={item.enabled === false ? 'Enable in Apply All' : 'Skip in Apply All'}
                  className="text-ink"
                  onClick={() => onToggle(item.id, item.enabled === false)}
                >
                  <AppIcon id={item.enabled === false ? 'x' : 'check'} size={12} />
                </IconButton>
              </div>
            </Fragment>
          ))}
          {moving() && slot === customs.length ? <span className="mt-0.5 block h-0.5 rounded-full bg-accent" /> : null}
        </div>
        <button
          type="button"
          className="mt-1 flex w-full shrink-0 items-center justify-center rounded px-2 py-1.5 text-sm text-muted hover:bg-field hover:text-ink"
          aria-label="New template"
          title="New template"
          onClick={onCreate}
        >
          +
        </button>
      </div>
      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <ContextMenuItem
            label="Rename"
            icon="pencil"
            onClick={() => {
              onRename(menu.id)
              setMenu(null)
            }}
          />
          <ContextMenuItem
            label="Delete"
            danger
            onClick={() => {
              onDelete(menu.id)
              setMenu(null)
            }}
          />
        </ContextMenu>
      ) : null}
    </aside>
  )
}

function rowClass(on: boolean) {
  return [
    'flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm',
    on ? 'bg-accent text-ink' : 'text-muted hover:bg-field hover:text-ink',
  ].join(' ')
}
