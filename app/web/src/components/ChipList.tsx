import { Fragment, type ReactNode, useState } from 'react'

type ChipListProps = {
  value: string[]
  onChange: (value: string[]) => void
  onChipClick?: () => void
  children?: ReactNode
  removable?: boolean
}

export function ChipList({ value, onChange, onChipClick, children, removable = true }: ChipListProps) {
  const [drag, setDrag] = useState<number | null>(null)
  const [slot, setSlot] = useState<number | null>(null)

  function remove(item: string) {
    onChange(value.filter((entry) => entry !== item))
  }

  function moving() {
    return drag !== null && slot !== null && slot !== drag && slot !== drag + 1
  }

  function applyDrop() {
    if (!moving() || drag === null || slot === null) {
      return
    }
    const next = [...value]
    const [item] = next.splice(drag, 1)
    next.splice(drag < slot ? slot - 1 : slot, 0, item)
    onChange(next)
  }

  function clearDrag() {
    setDrag(null)
    setSlot(null)
  }

  return (
    <div
      className="flex min-h-6 min-w-0 flex-1 flex-wrap gap-1"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        applyDrop()
      }}
    >
      {value.map((item, index) => (
        <Fragment key={item}>
          {moving() && slot === index ? (
            <span className="w-0.5 self-stretch rounded-full bg-accent" />
          ) : null}
          <span
            draggable
            className={[
              'inline-flex cursor-grab items-center gap-1 rounded bg-bg px-1.5 py-0.5 text-xs text-ink active:cursor-grabbing',
              drag === index ? 'opacity-20' : '',
            ].join(' ')}
            onClick={(event) => {
              event.stopPropagation()
              onChipClick?.()
            }}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', item)
              setDrag(index)
              setSlot(index)
            }}
            onDragOver={(event) => {
              event.preventDefault()
              event.stopPropagation()
              if (drag === null) {
                return
              }
              setSlot(index === drag ? drag : index < drag ? index : index + 1)
            }}
            onDrop={(event) => {
              event.preventDefault()
              event.stopPropagation()
              applyDrop()
            }}
            onDragEnd={clearDrag}
          >
            {item}
            {removable ? (
              <button
                type="button"
                className="px-0.5 text-sm leading-none text-muted hover:text-ink"
                aria-label={`Remove ${item}`}
                onClick={(event) => {
                  event.stopPropagation()
                  remove(item)
                }}
              >
                ×
              </button>
            ) : null}
          </span>
        </Fragment>
      ))}
      {moving() && slot === value.length ? (
        <span className="w-0.5 self-stretch rounded-full bg-accent" />
      ) : null}
      {children}
    </div>
  )
}
