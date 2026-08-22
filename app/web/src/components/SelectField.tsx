import { useEffect, useMemo, useRef, useState } from 'react'
import { AppIcon } from '@/components/AppIcon.tsx'

type SelectOption = { value: string; label: string; badge?: string }

type SelectFieldProps = {
  value: string
  onChange: (value: string) => void
  options: string[] | SelectOption[]
  allowCustom?: boolean
  placeholder?: string
  icon?: string
  chevron?: 'dropdown' | 'expand'
  expanded?: boolean
  onExpand?: () => void
  className?: string
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

function wrap(index: number, count: number, delta: number) {
  if (count <= 0) {
    return 0
  }
  return (index + delta + count) % count
}

function sameOption(item: SelectOption, text: string) {
  const q = text.toLowerCase()
  return item.label.toLowerCase() === q || item.value.toLowerCase() === q
}

export function SelectField({
  value,
  onChange,
  options,
  allowCustom = false,
  placeholder,
  icon,
  chevron = 'dropdown',
  expanded = false,
  onExpand,
  className = '',
}: SelectFieldProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const menu = useRef<HTMLUListElement>(null)
  const items = toOptions(options)
  const currentOption = items.find((item) => item.value === value)
  const current = currentOption?.label ?? value
  const shown = useMemo(() => items.filter((item) => matches(item, query)), [items, query])

  function dismiss() {
    setOpen(false)
    setQuery('')
    setActive(0)
    input.current?.blur()
  }

  function pick(next: string) {
    onChange(next)
    dismiss()
  }

  function applyTyped(text: string) {
    const hit = items.find((item) => sameOption(item, text))
    onChange(hit ? hit.value : text)
    dismiss()
  }

  const onOutside = useRef(() => {})
  onOutside.current = () => {
    const text = query.trim()
    if (allowCustom && text) {
      applyTyped(text)
      return
    }
    dismiss()
  }

  useEffect(() => {
    setActive(0)
  }, [query, open])

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (root.current?.contains(event.target as Node)) {
        return
      }
      onOutside.current()
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        dismiss()
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

  useEffect(() => {
    if (!open) {
      return
    }
    const el = menu.current?.querySelector('[data-active="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [active, open, shown])

  return (
    <div ref={root} className={['relative min-w-0', className].filter(Boolean).join(' ')}>
      <div className="field-select">
        {icon ? <AppIcon id={icon} size={14} className="text-muted" /> : null}
        <input
          ref={input}
          value={open ? query : current}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          aria-expanded={open}
          onFocus={() => {
            if (!open) {
              setQuery('')
            }
          }}
          onMouseDown={() => {
            setOpen(true)
            setQuery('')
          }}
          onChange={(event) => {
            const next = event.target.value
            setQuery(next)
            setOpen(true)
            if (allowCustom) {
              onChange(next)
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              if (!open) {
                setOpen(true)
                return
              }
              setActive((index) => wrap(index, shown.length, event.key === 'ArrowDown' ? 1 : -1))
              return
            }
            if (event.key === 'Enter' && open) {
              event.preventDefault()
              const hit = shown[active] ?? shown[0]
              if (hit) {
                pick(hit.value)
                return
              }
              const text = query.trim()
              if (allowCustom && text) {
                applyTyped(text)
              }
            }
          }}
        />
        {!open && currentOption?.badge ? (
          <span className="shrink-0 rounded-full border border-green/70 bg-green/25 px-1.5 py-0.5 text-[0.625rem] leading-none text-green-bright">
            {currentOption.badge}
          </span>
        ) : null}
        <button
          type="button"
          tabIndex={-1}
          className="field-select-chevron"
          aria-label={chevron === 'expand' ? (expanded ? 'Collapse' : 'Expand') : open ? 'Close' : 'Open'}
          onMouseDown={(event) => {
            event.preventDefault()
            if (chevron === 'expand') {
              if (open) {
                dismiss()
              }
              onExpand?.()
              return
            }
            if (open) {
              dismiss()
              return
            }
            setQuery('')
            setOpen(true)
            input.current?.focus()
          }}
        >
          <AppIcon id={chevron === 'expand' ? (expanded ? 'chevron-up' : 'chevron-down') : open ? 'chevron-up' : 'chevron-down'} size={12} />
        </button>
      </div>
      {open ? (
        <ul ref={menu} className="select-menu">
          {shown.map((item, index) => (
            <li key={`${item.value}:${item.label}`}>
              <button
                type="button"
                data-active={index === active ? 'true' : undefined}
                className={index === active ? 'is-selected' : undefined}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(item.value)}
              >
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{item.label}</span>
                  {item.badge ? (
                    <span className="shrink-0 rounded-full border border-green/70 bg-green/25 px-1.5 py-0.5 text-[0.625rem] leading-none text-green-bright">
                      {item.badge}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
