import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { UNGROUPED } from './scopeTree.ts'
import type { RefObject } from 'react'

export function ScopeGroupList({
  listWidth,
  groups,
  movable,
  selected,
  moving,
  drag,
  slot,
  groupDrop,
  dragged,
  scopeDragRef,
  onSelect,
  onApplyDrop,
  onHoverSlot,
  onDropScope,
  onSetDrag,
  onSetSlot,
  onSetGroupDrop,
  onEndDrag,
}: {
  listWidth: number
  groups: string[]
  movable: string[]
  selected: string
  moving: boolean
  drag: number | null
  slot: number | null
  groupDrop: string
  dragged: RefObject<boolean>
  scopeDragRef: RefObject<string>
  onSelect: (title: string) => void
  onApplyDrop: () => void
  onHoverSlot: (index: number) => void
  onDropScope: (title: string) => void
  onSetDrag: (index: number | null) => void
  onSetSlot: (index: number | null) => void
  onSetGroupDrop: (value: string) => void
  onEndDrag: () => void
}) {
  return (
    <div
      className="flex min-h-0 shrink-0 flex-col gap-1 overflow-y-auto pr-1"
      style={{ width: listWidth }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        if (!scopeDragRef.current) {
          onApplyDrop()
        }
      }}
    >
      {movable.map((item, index) => (
        <div key={item}>
          {moving && slot === index ? <span className="mb-1 block h-0.5 rounded-full bg-accent" /> : null}
          <div
            draggable
            className={[
              'flex cursor-grab items-center rounded border active:cursor-grabbing',
              groupDrop === item
                ? 'border-accent bg-accent/20 text-ink'
                : item === selected
                  ? 'border-accent bg-line text-ink'
                  : 'border-line bg-field text-ink',
              drag === index ? 'opacity-20' : '',
            ].join(' ')}
            onClick={() => {
              if (!dragged.current) {
                onSelect(item)
              }
            }}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', item)
              dragged.current = true
              onSetDrag(index)
              onSetSlot(index)
            }}
            onDragEnd={() => {
              onEndDrag()
              requestAnimationFrame(() => {
                dragged.current = false
              })
            }}
            onDragOver={(event) => {
              event.preventDefault()
              event.stopPropagation()
              if (scopeDragRef.current) {
                onSetGroupDrop(item)
                return
              }
              onHoverSlot(index)
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node) && groupDrop === item) {
                onSetGroupDrop('')
              }
            }}
            onDrop={(event) => {
              event.preventDefault()
              event.stopPropagation()
              if (scopeDragRef.current) {
                onDropScope(item)
                return
              }
              onApplyDrop()
            }}
          >
            <span className="min-w-0 flex-1 truncate py-1.5 pl-2 text-sm">{item}</span>
            <span className="flex h-8 w-5 shrink-0 items-center justify-center text-muted">
              <AppIcon id="grip-vertical" size={12} />
            </span>
          </div>
        </div>
      ))}
      {moving && slot === movable.length ? <span className="h-0.5 rounded-full bg-accent" /> : null}
      {groups.includes(UNGROUPED) ? (
        <button
          type="button"
          className={[
            'flex items-center justify-between rounded border px-2 py-1.5 text-left text-sm',
            groupDrop === UNGROUPED
              ? 'border-accent bg-accent/20 text-ink'
              : selected === UNGROUPED
                ? 'border-accent bg-line text-ink'
                : 'border-line bg-field text-ink',
          ].join(' ')}
          onClick={() => onSelect(UNGROUPED)}
          onDragOver={(event) => {
            event.preventDefault()
            event.stopPropagation()
            if (scopeDragRef.current) {
              onSetGroupDrop(UNGROUPED)
            } else if (drag !== null) {
              onSetSlot(movable.length)
            }
          }}
          onDrop={(event) => {
            event.preventDefault()
            event.stopPropagation()
            if (scopeDragRef.current) {
              onDropScope(UNGROUPED)
            } else {
              onApplyDrop()
            }
          }}
        >
          <span className="min-w-0 truncate">{UNGROUPED}</span>
          <span className="text-[10px] uppercase tracking-wide text-muted">Default</span>
        </button>
      ) : null}
      {groups.length === 0 ? <p className="px-1 text-sm text-muted">No groups yet.</p> : null}
    </div>
  )
}
