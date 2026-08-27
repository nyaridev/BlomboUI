import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { Fragment, type ReactNode, useRef, useState } from 'react'

type ChipListProps = {
  value: string[]
  onChange: (value: string[]) => void
  onChipClick?: (item: string) => void
  children?: ReactNode
  removable?: boolean
  className?: string
  chipClassName?: (item: string) => string
  chipTitle?: (item: string) => string
  chipLabel?: (item: string) => string
  renderChip?: (item: string) => ReactNode
}

export function ChipList({
  value,
  onChange,
  onChipClick,
  children,
  removable = true,
  className = 'flex min-h-6 min-w-0 flex-1 flex-wrap gap-1',
  chipClassName,
  chipTitle,
  chipLabel,
  renderChip,
}: ChipListProps) {
  const [drag, setDrag] = useState<number | null>(null)
  const [slot, setSlot] = useState<number | null>(null)
  const dragged = useRef(false)

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
      className={className}
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
            title={chipTitle?.(item) || (chipLabel ? item : undefined)}
            className={[
              'inline-flex shrink-0 cursor-grab items-center gap-1 rounded px-1.5 py-0.5 text-xs active:cursor-grabbing',
              chipClassName?.(item) || 'bg-bg text-ink',
              drag === index ? 'opacity-20' : '',
            ].join(' ')}
            onClick={(event) => {
              event.stopPropagation()
              if (dragged.current) {
                return
              }
              onChipClick?.(item)
            }}
            onDragStart={(event) => {
              event.stopPropagation()
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', item)
              dragged.current = false
              setDrag(index)
              setSlot(index)
            }}
            onDrag={() => {
              dragged.current = true
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
            {renderChip ? renderChip(item) : chipLabel?.(item) || item}
            {removable ? (
              <button
                type="button"
                className="px-0.5 text-sm leading-none text-muted hover:text-ink"
                aria-label={`Remove ${chipLabel?.(item) || item}`}
                onMouseDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  remove(item)
                }}
              >
                <AppIcon id="x" size={12} />
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
