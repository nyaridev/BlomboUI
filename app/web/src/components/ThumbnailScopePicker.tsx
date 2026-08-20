import { AppIcon } from '@/components/AppIcon.tsx'
import { SelectField } from '@/components/SelectField.tsx'
import { GLOBAL_SCOPE, selectedScopeIds } from '@/lib/thumbView.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useThumbnailScopeStore, useThumbView } from '@/stores/thumbnailScopeStore.ts'
import { useEffect, useMemo, useRef, useState } from 'react'

export function ThumbnailScopePicker({
  fallbackKind,
}: {
  fallbackKind?: 'checkpoints' | 'loras' | 'wildcards' | 'trash'
}) {
  useThumbView(fallbackKind)
  const items = useThumbnailScopeStore((s) => s.items)
  const loaded = useThumbnailScopeStore((s) => s.loaded)
  const load = useThumbnailScopeStore((s) => s.load)
  const toggleId = useThumbnailScopeStore((s) => s.toggleId)
  const replaceGroup = useThumbnailScopeStore((s) => s.replaceGroup)
  const setAuto = useThumbnailScopeStore((s) => s.setAuto)
  const setMode = useThumbnailScopeStore((s) => s.setMode)
  const auto = useSettingsStore((s) => s.thumbScopeAuto)
  const mode = useSettingsStore((s) => s.thumbDisplayMode)
  const galleryFallback = useSettingsStore((s) => s.galleryThumbFallback)
  const trashFallback = useSettingsStore((s) => s.trashThumbFallback)
  const setGalleryThumbFallback = useSettingsStore((s) => s.setGalleryThumbFallback)
  const setTrashThumbFallback = useSettingsStore((s) => s.setTrashThumbFallback)
  const selected = selectedScopeIds()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!loaded) {
      void load()
    }
  }, [load, loaded])

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const named = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const leftover = items.filter((item) => item.id !== GLOBAL_SCOPE && !selected.includes(item.id))
    const matched = leftover.filter((item) => {
      if (!needle) {
        return true
      }
      const hay = [item.name, item.group, ...item.required, ...item.optional].join(' ').toLowerCase()
      return hay.includes(needle)
    })
    const groups = new Map<string, typeof matched>()
    for (const item of matched) {
      const key = item.group.trim() || 'Ungrouped'
      const list = groups.get(key) || []
      list.push(item)
      groups.set(key, list)
    }
    return [...groups.entries()]
  }, [items, query, selected])

  const fallbackOn =
    fallbackKind === 'trash'
      ? trashFallback
      : fallbackKind
        ? Boolean(galleryFallback[fallbackKind])
        : null

  function setFallback(value: boolean) {
    if (fallbackKind === 'trash') {
      setTrashThumbFallback(value)
      return
    }
    if (fallbackKind) {
      setGalleryThumbFallback(fallbackKind, value)
    }
  }

  return (
    <div ref={root} className="relative flex min-w-0 flex-1 items-stretch gap-1">
      <div
        className="flex min-w-0 flex-1 cursor-text items-center gap-1 overflow-hidden rounded border border-line bg-field px-1.5 focus-within:border-accent"
        onClick={() => {
          input.current?.focus()
          setOpen(true)
        }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {selected.length === 0 ? (
            <span className="shrink-0 rounded bg-bg px-1.5 py-0.5 text-xs text-muted">Global</span>
          ) : (
            selected.map((id) => (
              <span
                key={id}
                className="inline-flex shrink-0 items-center gap-1 rounded bg-bg px-1.5 py-0.5 text-xs text-ink"
              >
                {named.get(id)?.name || id}
                <button
                  type="button"
                  className="text-muted hover:text-ink"
                  aria-label={`Remove ${named.get(id)?.name || id}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    toggleId(id)
                  }}
                >
                  <AppIcon id="x" size={10} />
                </button>
              </span>
            ))
          )}
          <input
            ref={input}
            className="min-w-16 flex-1 bg-transparent py-0.5 text-xs text-ink outline-none"
            value={query}
            placeholder={selected.length === 0 ? 'Thumbnail scopes…' : ''}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => {
              setQuery(event.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key !== 'Backspace' || query || selected.length === 0) {
                return
              }
              event.preventDefault()
              toggleId(selected[selected.length - 1])
            }}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
        {auto ? <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">Auto</span> : null}
      </div>
      <button
        type="button"
        className={['icon-btn', auto ? 'bg-line' : ''].join(' ')}
        aria-label={auto ? 'Disable Auto scopes' : 'Enable Auto scopes'}
        aria-pressed={auto}
        title={
          auto
            ? 'Auto on: scopes follow the generate prompt'
            : 'Auto: pick scopes from the generate prompt'
        }
        onClick={() => setAuto(!auto)}
      >
        <AppIcon id="sparkles" size={14} />
      </button>
      <div className="flex h-full w-36 shrink-0 [&>div]:h-full [&>div]:w-full [&_.field-select]:h-full [&_.field-select]:py-0">
        <SelectField
          value={mode}
          onChange={(value) => setMode(value === 'exact' ? 'exact' : 'likely')}
          options={[
            { value: 'likely', label: 'Most Likely' },
            { value: 'exact', label: 'Exact Scope' },
          ]}
        />
      </div>
      {fallbackOn != null ? (
        <button
          type="button"
          className={[
            'shrink-0 rounded border px-2 text-xs whitespace-nowrap',
            fallbackOn
              ? 'border-accent bg-accent text-ink'
              : 'border-line bg-field text-muted hover:bg-line hover:text-ink',
          ].join(' ')}
          aria-pressed={fallbackOn}
          title={fallbackOn ? 'Use Global thumbnails when this scope has none' : 'Show the default tile when this scope has no thumbnail'}
          onClick={() => setFallback(!fallbackOn)}
        >
          Global Fallback
        </button>
      ) : null}
      {open ? (
        <ul className="select-menu">
          <li>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                toggleId(GLOBAL_SCOPE)
                setQuery('')
              }}
            >
              Global
            </button>
          </li>
          {shown.length === 0 ? (
            <li className="px-2 py-1.5 text-sm text-muted">No matches</li>
          ) : (
            shown.map(([group, rows]) => (
              <li key={group} className="select-menu-group">
                <div className="select-menu-section">{group}</div>
                <ul>
                  {rows.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          replaceGroup(item.id)
                          setQuery('')
                        }}
                      >
                        {item.name}
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
