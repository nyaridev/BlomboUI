import { useEffect, useMemo, useRef, useState } from 'react'
import { AppIcon } from '@/components/AppIcon.tsx'

type SelectOption = { value: string; label: string }

type SelectFieldProps = {
  value: string
  onChange: (value: string) => void
  options: string[] | SelectOption[]
}

function toOptions(options: string[] | SelectOption[]): SelectOption[] {
  return options.map((item) => (typeof item === 'string' ? { value: item, label: item } : item))
}

function matches(item: SelectOption, query: string) {
  if (!query) {
    return true
  }
  const q = query.toLowerCase()
  return item.label.toLowerCase().includes(q) || item.value.toLowerCase().includes(q)
}

export function SelectField({ value, onChange, options }: SelectFieldProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const menu = useRef<HTMLUListElement>(null)
  const items = toOptions(options)
  const current = items.find((item) => item.value === value)?.label ?? value
  const shown = useMemo(() => items.filter((item) => matches(item, query)), [items, query])

  function close() {
    setOpen(false)
    setQuery('')
    input.current?.blur()
  }

  function pick(next: string) {
    onChange(next)
    close()
  }

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) {
        close()
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        close()
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
      if (!el) {
        return
      }
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

  return (
    <div ref={root} className="relative min-w-0">
      <div className="field-select">
        <input
          ref={input}
          value={open ? query : current}
          spellCheck={false}
          autoComplete="off"
          aria-expanded={open}
          onFocus={() => {
            setQuery('')
            setOpen(true)
          }}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && open) {
              event.preventDefault()
              if (shown[0]) {
                pick(shown[0].value)
              }
            }
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          className="field-select-chevron"
          aria-label={open ? 'Close' : 'Open'}
          onMouseDown={(event) => {
            event.preventDefault()
            if (open) {
              close()
            } else {
              input.current?.focus()
            }
          }}
        >
          <AppIcon id={open ? 'chevron-up' : 'chevron-down'} size={12} />
        </button>
      </div>
      {open ? (
        <ul ref={menu} className="select-menu">
          {shown.map((item) => (
            <li key={item.value}>
              <button
                type="button"
                className={item.value === value ? 'is-selected' : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(item.value)}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
