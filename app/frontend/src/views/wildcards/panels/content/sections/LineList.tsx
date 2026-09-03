import { IconButton } from '@/components/controls/button/IconButton.tsx'
import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { usePromptWeightKey } from '@/lib/prompt/weight.ts'
import { useLayoutEffect, useRef, useState } from 'react'

function GrowField({ value, onChange, inset }: { value: string; onChange: (value: string) => void; inset?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const onKeyDown = usePromptWeightKey(onChange)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) {
      return
    }
    el.style.height = '32px'
    const next = el.scrollHeight + (el.offsetHeight - el.clientHeight)
    el.style.height = `${Math.max(32, next)}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      rows={1}
      className={[
        'box-border min-h-8 w-full resize-none overflow-hidden rounded border border-line px-2 py-0 font-mono text-sm leading-[1.875rem] text-ink outline-none placeholder:text-muted focus:border-accent',
        inset ? 'bg-bg' : 'bg-field',
      ].join(' ')}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      spellCheck={false}
    />
  )
}

function addClass(depth?: number) {
  if (depth == null) {
    return 'flex h-8 flex-1 items-center justify-center rounded border border-line bg-field text-sm leading-none text-muted hover:bg-line hover:text-ink'
  }
  return `yaml-add yaml-d${depth % 10}`
}

export function LineList({
  value,
  onChange,
  depth,
}: {
  value: string[]
  onChange: (value: string[]) => void
  depth?: number
}) {
  const [drag, setDrag] = useState<number | null>(null)
  const [slot, setSlot] = useState<number | null>(null)
  const moving = drag !== null && slot !== null && slot !== drag && slot !== drag + 1

  function applyDrop() {
    if (!moving || drag === null || slot === null) {
      return
    }
    const next = [...value]
    const [item] = next.splice(drag, 1)
    next.splice(drag < slot ? slot - 1 : slot, 0, item)
    onChange(next)
    setDrag(null)
    setSlot(null)
  }

  function patch(index: number, line: string) {
    onChange(value.map((item, i) => (i === index ? line : item)))
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div
      className={depth != null ? 'flex flex-col gap-2' : 'flex flex-col gap-1.5'}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        applyDrop()
      }}
    >
      {value.map((line, index) => (
        <div key={index}>
          {moving && slot === index ? <span className="mb-1.5 block h-0.5 rounded-full bg-accent" /> : null}
          <div className={drag === index ? 'opacity-20' : ''}>
            <div
              className="flex items-start gap-1.5"
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
            >
              <span
                draggable
                className="flex h-8 w-5 shrink-0 cursor-grab items-center justify-center text-muted active:cursor-grabbing"
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', String(index))
                  const rowEl = event.currentTarget.parentElement
                  if (rowEl instanceof HTMLElement) {
                    const rect = rowEl.getBoundingClientRect()
                    event.dataTransfer.setDragImage(
                      rowEl,
                      Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
                      Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
                    )
                  }
                  setDrag(index)
                  setSlot(index)
                }}
                onDragEnd={() => {
                  setDrag(null)
                  setSlot(null)
                }}
              >
                <AppIcon id="grip-vertical" size={12} />
              </span>
              <GrowField value={line} onChange={(next) => patch(index, next)} inset={depth != null} />
              <IconButton className="shrink-0" aria-label="Remove line" onClick={() => remove(index)}>
                <AppIcon id="x" />
              </IconButton>
            </div>
          </div>
        </div>
      ))}
      {moving && slot === value.length ? <span className="h-0.5 rounded-full bg-accent" /> : null}
      <div className="flex gap-1.5">
        <button type="button" className={addClass(depth)} aria-label="Add line" title="Add line" onClick={() => onChange([...value, ''])}>
          <AppIcon id="plus" size={14} />
        </button>
      </div>
    </div>
  )
}
