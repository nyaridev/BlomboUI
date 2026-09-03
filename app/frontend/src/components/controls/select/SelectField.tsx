import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { PrimitiveInput } from '@/components/primitives/PrimitiveInput.tsx'
import { PrimitiveButton } from '@/components/primitives/PrimitiveButton.tsx'
import { matchesOption, sameOption, toOptions, wrap, type SelectOption } from '@/components/controls/select/selectNav.ts'

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
  menu?: 'default' | 'tall'
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
  menu: menuSize = 'default',
}: SelectFieldProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [menuBox, setMenuBox] = useState<CSSProperties>()
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const menu = useRef<HTMLUListElement>(null)
  const tallMenu = menuSize === 'tall'
  const items = toOptions(options)
  const currentOption = items.find((item) => item.value === value)
  const current = currentOption?.label ?? value
  const shown = useMemo(() => items.filter((item) => matchesOption(item, query)), [items, query])

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

  useLayoutEffect(() => {
    if (!open || !tallMenu) {
      setMenuBox(undefined)
      return
    }
    function place() {
      const rect = root.current?.getBoundingClientRect()
      if (!rect) {
        return
      }
      const gap = 4
      const edge = 8
      const want = Math.min(window.innerHeight * 0.55, 28 * 16)
      const spaceBelow = window.innerHeight - rect.bottom - gap - edge
      const spaceAbove = rect.top - gap - edge
      const minBelow = 8 * 16
      let top = rect.bottom + gap
      let maxH = Math.min(want, Math.max(0, spaceBelow))
      if (spaceBelow < minBelow && spaceAbove > spaceBelow) {
        maxH = Math.min(want, Math.max(0, spaceAbove))
        top = Math.max(edge, rect.top - gap - maxH)
      }
      setMenuBox({
        position: 'fixed',
        top,
        left: rect.left,
        right: 'auto',
        width: rect.width,
        maxHeight: maxH,
        overflow: 'auto',
        zIndex: 80,
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, tallMenu, shown.length])

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      const node = event.target as Node
      if (root.current?.contains(node) || menu.current?.contains(node)) {
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
  }, [open, menuBox])

  useEffect(() => {
    if (!open) {
      return
    }
    const el = menu.current?.querySelector('[data-active="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [active, open, shown])

  const list = open ? (
    <ul ref={menu} className="select-menu" style={tallMenu ? menuBox : undefined}>
      {shown.map((item, index) => (
        <li key={`${item.value}:${item.label}`}>
          <button
            type="button"
            disabled={item.disabled}
            data-active={index === active ? 'true' : undefined}
            className={index === active ? 'is-selected' : undefined}
            onMouseEnter={() => setActive(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (!item.disabled) {
                pick(item.value)
              }
            }}
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
  ) : null

  return (
    <div ref={root} className={['relative min-w-0', className].filter(Boolean).join(' ')}>
      <div className="field-select">
        {icon ? <AppIcon id={icon} size={14} className="text-muted" /> : null}
        <PrimitiveInput
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
              if (hit && !hit.disabled) {
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
        <PrimitiveButton
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
        </PrimitiveButton>
      </div>
      {open ? (tallMenu && menuBox ? createPortal(list, document.body) : tallMenu ? null : list) : null}
    </div>
  )
}
