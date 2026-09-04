import { useRef, useState, type DragEvent } from 'react'

export type TileDragProps = {
  draggable: boolean
  dragging: boolean
  dropPosition?: 'before' | 'after'
  onDragStart: (event: DragEvent<HTMLElement>) => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
}

export function reorderIds(order: string[], draggedId: string, targetId: string, before = true): string[] | null {
  const from = order.indexOf(draggedId)
  const target = order.indexOf(targetId)
  if (from < 0 || target < 0 || from === target) {
    return null
  }
  const next = [...order]
  const [moved] = next.splice(from, 1)
  const insertAt = next.indexOf(targetId) + (before ? 0 : 1)
  if (insertAt === from) {
    return null
  }
  next.splice(insertAt, 0, moved)
  return next
}

export function useTileReorder(ids: string[], onReorder: (next: string[]) => void) {
  const dragged = useRef<string | null>(null)
  const idsRef = useRef(ids)
  idsRef.current = ids
  const onReorderRef = useRef(onReorder)
  onReorderRef.current = onReorder
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; before: boolean } | null>(null)

  function endDrag() {
    dragged.current = null
    setDraggingId(null)
    setDropTarget(null)
  }

  function applyDrop(targetId: string, before: boolean) {
    const next = reorderIds(idsRef.current, dragged.current || '', targetId, before)
    if (next) {
      onReorderRef.current(next)
    }
    endDrag()
  }

  function dragProps(id: string): TileDragProps {
    return {
      draggable: true,
      dragging: draggingId === id,
      dropPosition: dropTarget?.id === id ? (dropTarget.before ? 'before' : 'after') : undefined,
      onDragStart(event) {
        dragged.current = id
        setDraggingId(id)
        setDropTarget(null)
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', id)
        const rect = event.currentTarget.getBoundingClientRect()
        event.dataTransfer.setDragImage(
          event.currentTarget,
          Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
          Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
        )
      },
      onDragOver(event) {
        const source = dragged.current
        if (!source || source === id) {
          setDropTarget(null)
          return
        }
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        const rect = event.currentTarget.getBoundingClientRect()
        const before = event.clientX < rect.left + rect.width / 2
        const order = idsRef.current
        const from = order.indexOf(source)
        const next = order.filter((item) => item !== source)
        const insertAt = next.indexOf(id) + (before ? 0 : 1)
        if (from < 0 || insertAt === from) {
          setDropTarget(null)
          return
        }
        setDropTarget((previous) => (
          previous?.id === id && previous.before === before ? previous : { id, before }
        ))
      },
      onDrop(event) {
        event.preventDefault()
        const rect = event.currentTarget.getBoundingClientRect()
        applyDrop(id, event.clientX < rect.left + rect.width / 2)
      },
      onDragEnd: endDrag,
    }
  }

  return { dragProps }
}
