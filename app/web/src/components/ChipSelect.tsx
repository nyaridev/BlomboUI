import { useEffect, useMemo, useRef, useState } from 'react'
import { Chevron } from '@/components/Chevron.tsx'
import { ChipList } from '@/components/ChipList.tsx'

export type ChipSection = { title: string; options: string[] }

type ChipSelectProps = {
  options: string[] | ChipSection[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  mode?: 'select' | 'order'
}

function asSections(options: string[] | ChipSection[]): ChipSection[] {
  if (options.length > 0 && typeof options[0] !== 'string') {
    return options as ChipSection[]
  }
  return [{ title: '', options: options as string[] }]
}

function matches(item: string, query: string) {
  return !query || item.toLowerCase().includes(query.toLowerCase())
}

export function ChipSelect({ options, value, onChange, placeholder = 'Select…', mode = 'select' }: ChipSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
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
        const items = matches(section.title, query) ? left : left.filter((item) => matches(item, query))
        return { title: section.title, options: items }
      })
      .filter((section) => section.options.length > 0)
  }, [sections, value, query])
  const first = shown[0]?.options[0]
  const leftCount = sections.reduce((sum, section) => sum + section.options.filter((item) => !value.includes(item)).length, 0)

  function close() {
    setOpen(false)
    setQuery('')
  }

  function add(item: string) {
    onChange([...value, item])
    setQuery('')
    input.current?.focus()
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
    const el = field.current
    if (!el) {
      return
    }
    function measure() {
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
      <div className="flex min-h-9 items-center rounded border border-line bg-field px-2 py-1.5">
        <ChipList value={value} onChange={onChange} removable={false} />
      </div>
    )
  }

  return (
    <div ref={root} className="relative min-w-0">
      <div
        ref={field}
        className={[
          'flex min-h-9 cursor-text gap-1 rounded border border-line bg-field px-2 py-1.5 focus-within:border-accent',
          tall ? 'items-start' : 'items-center',
        ].join(' ')}
        onClick={() => {
          input.current?.focus()
          setOpen(true)
        }}
      >
        <ChipList value={value} onChange={onChange} onChipClick={() => input.current?.focus()}>
          <input
            ref={input}
            className="min-w-16 flex-1 bg-transparent py-0.5 text-sm text-ink outline-none"
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
              if (event.key === 'Enter' && open && first) {
                event.preventDefault()
                add(first)
              }
            }}
            onClick={(event) => event.stopPropagation()}
          />
        </ChipList>
        <button
          type="button"
          tabIndex={-1}
          className={tall ? 'mt-1 text-muted' : 'text-muted'}
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
          <Chevron dir={open ? 'up' : 'down'} />
        </button>
      </div>
      {open ? (
        <ul ref={menu} className="select-menu">
          {shown.length === 0 ? (
            <li className="px-2 py-1.5 text-sm text-muted">{leftCount === 0 ? 'Nothing left' : 'No matches'}</li>
          ) : (
            shown.map((section) => (
              <li key={section.title || 'options'} className="select-menu-group">
                {section.title ? <div className="select-menu-section">{section.title}</div> : null}
                <ul>
                  {section.options.map((item) => (
                    <li key={item}>
                      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => add(item)}>
                        {item}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
