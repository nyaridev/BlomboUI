import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { GlyphMark } from '@/components/composites/chrome/GlyphMark.tsx'
import { EMOJIS } from '@/components/composites/chrome/emojiCatalog.ts'
import { GLYPH_COLORS, type Glyph } from '@/components/composites/chrome/glyph.ts'
import { ICON_IDS } from '@/components/composites/chrome/iconCatalog.ts'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

type Tab = 'icon' | 'emoji'

type IconPickerProps = {
  value: Glyph | null
  onChange: (value: Glyph) => void
  disabled?: boolean
  colors?: readonly { id: string; css: string }[]
  className?: string
  size?: number
}

function glyphKey(value: Glyph) {
  return value.kind === 'icon' ? `icon:${value.id}` : `emoji:${value.id}`
}

export function IconPicker({
  value,
  onChange,
  disabled = false,
  colors = GLYPH_COLORS,
  className = '',
  size = 16,
}: IconPickerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>(value?.kind ?? 'icon')
  const [query, setQuery] = useState('')
  const [color, setColor] = useState(value?.kind === 'icon' ? value.color : 'ink')
  const [pos, setPos] = useState<CSSProperties>({})

  function show() {
    if (disabled) {
      return
    }
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      const width = 352
      const height = 384
      const gap = 4
      let top = rect.bottom + gap
      let left = rect.left
      if (top + height > window.innerHeight - 8) {
        top = Math.max(8, rect.top - gap - height)
      }
      if (left + width > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - 8 - width)
      }
      setPos({ top, left, width })
    }
    setTab(value?.kind ?? 'icon')
    setQuery('')
    setColor(value?.kind === 'icon' ? value.color : 'ink')
    setOpen(true)
  }

  useEffect(() => {
    if (!open) {
      return
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return
      }
      event.stopImmediatePropagation()
      event.preventDefault()
      setOpen(false)
    }
    function onPointer(event: PointerEvent) {
      const node = event.target as Node | null
      if (triggerRef.current?.contains(node) || panelRef.current?.contains(node)) {
        return
      }
      setOpen(false)
      if (event.target instanceof HTMLElement && event.target.hasAttribute('data-overlay')) {
        event.stopPropagation()
        event.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onPointer, true)
    }
  }, [open])

  const needle = query.trim().toLowerCase()
  const iconIds = useMemo(() => {
    if (tab !== 'icon') {
      return []
    }
    if (!needle) {
      return ICON_IDS
    }
    return ICON_IDS.filter((id) => id.includes(needle) || id.replaceAll('-', ' ').includes(needle))
  }, [tab, needle])
  const emojis = useMemo(() => {
    if (tab !== 'emoji') {
      return []
    }
    if (!needle) {
      return EMOJIS
    }
    return EMOJIS.filter((item) => item.name.includes(needle) || item.id.includes(query.trim()))
  }, [tab, needle, query])

  function pickIcon(id: string) {
    onChange({ kind: 'icon', id, color: colors.length ? color : 'ink' })
  }

  function pickEmoji(id: string) {
    onChange({ kind: 'emoji', id })
  }

  function pickColor(id: string) {
    setColor(id)
    if (value?.kind === 'icon') {
      onChange({ kind: 'icon', id: value.id, color: id })
    }
  }

  const selected = value ? glyphKey(value) : ''

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={[
          'flex h-7 w-7 shrink-0 items-center justify-center rounded',
          disabled ? 'cursor-default text-muted' : 'text-muted hover:bg-line hover:text-ink',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={disabled ? 'Template icon' : 'Choose icon'}
        title={disabled ? 'Default icon' : 'Choose icon'}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
      >
        {value ? <GlyphMark value={value} size={size} /> : <AppIcon id="plus" size={size} />}
      </button>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              data-overlay=""
              className="fixed z-[70] flex h-96 flex-col gap-2 rounded-md border border-line bg-panel p-2 shadow-lg"
              style={pos}
            >
              <div className="flex shrink-0 gap-1">
                {(['icon', 'emoji'] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={[
                      'flex-1 rounded px-2 py-1 text-xs',
                      tab === item ? 'bg-accent text-ink' : 'text-muted hover:bg-line hover:text-ink',
                    ].join(' ')}
                    onClick={() => setTab(item)}
                  >
                    {item === 'icon' ? 'Icons' : 'Emojis'}
                  </button>
                ))}
              </div>
              <input
                className="w-full shrink-0 rounded border border-line bg-field px-2 py-1 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tab === 'icon' ? 'Search icons' : 'Search emojis'}
                autoFocus
              />
              <div className="grid min-h-0 flex-1 grid-cols-8 content-start gap-0.5 overflow-y-auto">
                {tab === 'icon'
                  ? iconIds.map((id) => {
                      const on = selected === `icon:${id}`
                      return (
                        <button
                          key={id}
                          type="button"
                          className={[
                            'flex h-8 w-8 items-center justify-center rounded',
                            on ? 'bg-accent text-ink' : 'text-ink hover:bg-line',
                          ].join(' ')}
                          title={id}
                          onClick={() => pickIcon(id)}
                        >
                          <GlyphMark value={{ kind: 'icon', id, color }} size={16} />
                        </button>
                      )
                    })
                  : emojis.map((item) => {
                      const on = selected === `emoji:${item.id}`
                      return (
                        <button
                          key={`${item.id}-${item.name}`}
                          type="button"
                          className={[
                            'flex h-8 w-8 items-center justify-center rounded',
                            on ? 'bg-accent text-ink' : 'hover:bg-line',
                          ].join(' ')}
                          title={item.name}
                          onClick={() => pickEmoji(item.id)}
                        >
                          <GlyphMark value={{ kind: 'emoji', id: item.id }} size={16} />
                        </button>
                      )
                    })}
              </div>
              {tab === 'icon' && colors.length ? (
                <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-line pt-2">
                  {colors.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={[
                        'h-5 w-5 rounded-full border',
                        color === item.id ? 'border-ink' : 'border-line',
                      ].join(' ')}
                      style={{ background: item.css }}
                      aria-label={item.id}
                      title={item.id}
                      onClick={() => pickColor(item.id)}
                    />
                  ))}
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
