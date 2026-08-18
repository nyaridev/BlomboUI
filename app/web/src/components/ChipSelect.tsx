import { useEffect, useRef, useState } from 'react'
import { Chevron } from '@/components/Chevron.tsx'
import { ChipList } from '@/components/ChipList.tsx'

type ChipSelectProps = {
  options: string[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
}

export function ChipSelect({ options, value, onChange, placeholder = 'Select…' }: ChipSelectProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLUListElement>(null)
  const left = options.filter((item) => !value.includes(item))

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(() => {
    const el = menu.current
    if (!open || !el) {
      return
    }
    function onWheel(event: WheelEvent) {
      event.stopPropagation()
      const atTop = el.scrollTop <= 0 && event.deltaY < 0
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1 && event.deltaY > 0
      if (atTop || atBottom || el.scrollHeight <= el.clientHeight) {
        event.preventDefault()
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [open])

  function add(item: string) {
    onChange([...value, item])
  }

  return (
    <div ref={root} className="relative min-w-0">
      <div
        className="flex min-h-9 cursor-pointer items-start gap-1 rounded border border-line bg-field px-2 py-1.5 focus-within:border-accent"
        onClick={() => setOpen((v) => !v)}
      >
        <ChipList value={value} onChange={onChange} onChipClick={() => setOpen(true)}>
          {value.length === 0 ? (
            <span className="self-center text-sm text-muted">{placeholder}</span>
          ) : null}
        </ChipList>
        <span className="mt-1 text-muted">
          <Chevron dir={open ? 'up' : 'down'} />
        </span>
      </div>
      {open ? (
        <ul ref={menu} className="select-menu">
          {left.length === 0 ? (
            <li className="px-2 py-1.5 text-sm text-muted">Nothing left</li>
          ) : (
            left.map((item) => (
              <li key={item}>
                <button type="button" onClick={() => add(item)}>
                  {item}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
