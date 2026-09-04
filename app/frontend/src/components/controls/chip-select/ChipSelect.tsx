import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { ChipList } from '@/components/controls/chip-list/ChipList.tsx'
import { matches, wrap } from '@/components/controls/select/selectNav.ts'

export type ChipSection = { title: string; options: string[] }

export type ChipSelectOverlay = (ctx: {
  anchor: DOMRect
  onClose: () => void
  retain: RefObject<HTMLDivElement | null>
}) => ReactNode

type ChipSelectProps = {
  options: string[] | ChipSection[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  mode?: 'select' | 'order'
  chipLabel?: (item: string) => string
  chipClassName?: (item: string) => string
  compact?: boolean
  allowCustom?: boolean
  overlay?: ChipSelectOverlay
}

function asSections(options: string[] | ChipSection[]): ChipSection[] {
  if (options.length > 0 && typeof options[0] !== 'string') {
    return options as ChipSection[]
  }
  return [{ title: '', options: options as string[] }]
}

const ADD = '__chip_add__'

export function ChipSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  mode = 'select',
  chipLabel,
  chipClassName,
  compact = false,
  allowCustom = false,
  overlay,
}: ChipSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [tall, setTall] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const menu = useRef<HTMLUListElement>(null)
  const sections = useMemo(() => asSections(options), [options])
  const shown = useMemo(() => {
    return sections
      .map((section) => {
        const left = section.options.filter((item) => !value.includes(item))
        const items = matches(section.title, query) ? left : left.filter((item) => matches(item, query, chipLabel))
        return { title: section.title, options: items }
      })
      .filter((section) => section.options.length > 0)
  }, [sections, value, query, chipLabel])
  const custom = allowCustom ? query.trim() : ''
  const canAddCustom = Boolean(custom) && !value.includes(custom)
  const flat = useMemo(() => {
    const items = shown.flatMap((section) => section.options)
    return canAddCustom && !items.includes(custom) ? [...items, ADD] : items
  }, [shown, canAddCustom, custom])
  const leftCount = sections.reduce((sum, section) => sum + section.options.filter((item) => !value.includes(item)).length, 0)

  function close() {
    setOpen(false)
    setQuery('')
    setActive(0)
  }

  function add(item: string) {
    if (!item || value.includes(item)) {
      return
    }
    onChange([...value, item])
    setQuery('')
    setActive(0)
    input.current?.focus()
  }

  function addCustom() {
    if (canAddCustom) {
      add(custom)
    }
  }

  useEffect(() => {
    setActive(0)
  }, [query, open])

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      const node = event.target as Node | null
      if (root.current?.contains(node)) {
        return
      }
      if (node instanceof Element && node.closest('[data-overlay]')) {
        return
      }
      close()
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

  useEffect(() => {
    if (!open) {
      return
    }
    const el = menu.current?.querySelector('[data-active="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [active, open, flat])

  useEffect(() => {
    const el = field.current
    if (!el) {
      return
    }
    function measure() {
      if (!el) {
        return
      }
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      setTall(el.clientHeight > rem * 4.5)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [value, query])

  if (mode === 'order') {
    return (
      <div className="field-select">
        <ChipList value={value} onChange={onChange} removable={false} chipLabel={chipLabel} chipClassName={chipClassName} />
      </div>
    )
  }

  let optionIndex = 0

  return (
    <div ref={root} className={['relative min-w-0', compact ? 'h-full' : ''].filter(Boolean).join(' ')}>
      <div
        ref={field}
        className={[
          'field-select cursor-text',
          compact ? 'h-full min-h-0 overflow-hidden' : '',
          !compact && tall ? 'items-start' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => {
          input.current?.focus()
          setOpen(true)
        }}
      >
        <ChipList
          value={value}
          onChange={onChange}
          onChipClick={() => input.current?.focus()}
          chipLabel={chipLabel}
          chipClassName={chipClassName}
          className={
            compact
              ? 'flex min-h-0 min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto'
              : undefined
          }
        >
          <input
            ref={input}
            className={['min-w-16 flex-1 bg-transparent outline-none', compact ? 'text-xs' : ''].filter(Boolean).join(' ')}
            value={query}
            placeholder={value.length === 0 ? placeholder : ''}
            spellCheck={false}
            autoComplete="off"
            aria-expanded={open}
            onChange={(event) => {
              setQuery(event.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (overlay) {
                if (event.key === 'Enter' && allowCustom && custom) {
                  event.preventDefault()
                  addCustom()
                }
                if (event.key === 'Backspace' && !query && value.length) {
                  event.preventDefault()
                  onChange(value.slice(0, -1))
                }
                return
              }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                if (!open) {
                  setOpen(true)
                  return
                }
                setActive((index) => wrap(index, flat.length, event.key === 'ArrowDown' ? 1 : -1))
                return
              }
              if (event.key === 'Enter' && open) {
                const hit = flat[active] ?? flat[0]
                event.preventDefault()
                if (hit === ADD) {
                  addCustom()
                  return
                }
                if (hit) {
                  add(hit)
                  return
                }
                addCustom()
                return
              }
              if (event.key === 'Enter' && allowCustom && custom) {
                event.preventDefault()
                addCustom()
                return
              }
              if (event.key === 'Backspace' && !query && value.length) {
                event.preventDefault()
                onChange(value.slice(0, -1))
              }
            }}
            onClick={(event) => event.stopPropagation()}
          />
        </ChipList>
        <button
          type="button"
          tabIndex={-1}
          className={['field-select-chevron', !compact && tall ? 'mt-1' : ''].filter(Boolean).join(' ')}
          aria-label={open ? 'Close' : 'Open'}
          onMouseDown={(event) => {
            event.preventDefault()
            if (open) {
              close()
            } else {
              input.current?.focus()
              setOpen(true)
            }
          }}
        >
          <AppIcon id={open ? 'chevron-up' : 'chevron-down'} size={12} />
        </button>
      </div>
      {open && overlay && field.current
        ? overlay({ anchor: field.current.getBoundingClientRect(), onClose: close, retain: root })
        : null}
      {open && !overlay ? (
        <ul
          ref={menu}
          className="select-menu"
          onMouseDown={(event) => event.preventDefault()}
        >
          {shown.length === 0 && !canAddCustom ? (
            <li className="px-2 py-1.5 text-sm text-muted" onMouseDown={(event) => event.preventDefault()}>
              {leftCount === 0 && !allowCustom ? 'Nothing left' : 'No matches'}
            </li>
          ) : (
            <>
              {shown.map((section) => (
                <li key={section.title || 'options'} className="select-menu-group">
                  {section.title ? (
                    <div className="select-menu-section" onMouseDown={(event) => event.preventDefault()}>
                      {section.title}
                    </div>
                  ) : null}
                  <ul>
                    {section.options.map((item) => {
                      const index = optionIndex
                      optionIndex += 1
                      return (
                        <li key={item}>
                          <button
                            type="button"
                            data-active={index === active ? 'true' : undefined}
                            className={index === active ? 'is-selected' : undefined}
                            onMouseEnter={() => setActive(index)}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => add(item)}
                          >
                            {chipLabel ? chipLabel(item) : item}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </li>
              ))}
              {canAddCustom && !shown.some((section) => section.options.includes(custom)) ? (
                <li>
                  <button
                    type="button"
                    data-active={flat[active] === ADD ? 'true' : undefined}
                    className={flat[active] === ADD ? 'is-selected' : undefined}
                    onMouseEnter={() => setActive(Math.max(0, flat.lastIndexOf(ADD)))}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => addCustom()}
                  >
                    Add “{custom}”
                  </button>
                </li>
              ) : null}
            </>
          )}
        </ul>
      ) : null}
    </div>
  )
}
