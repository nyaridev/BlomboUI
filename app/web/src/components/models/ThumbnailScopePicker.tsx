import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { ChipList } from '@/components/primitives/ChipList.tsx'
import { SelectField } from '@/components/primitives/SelectField.tsx'
import { GLOBAL_SCOPE, selectedScopeIds } from '@/lib/gallery/thumbView.ts'
import { useModelsStore } from '@/stores/modelsStore.ts'
import { LOCAL_SCOPE_DEFAULT, useSettingsStore } from '@/stores/settingsStore.ts'
import { useThumbnailScopeStore, useThumbView } from '@/stores/thumbnailScopeStore.ts'
import { useEffect, useMemo, useRef, useState } from 'react'

export function ThumbnailScopePicker({
  fallbackKind,
  scopeKey = GLOBAL_SCOPE,
}: {
  fallbackKind?: 'checkpoints' | 'loras' | 'wildcards' | 'other' | 'trash'
  scopeKey?: string
}) {
  const local = Boolean(scopeKey && scopeKey !== GLOBAL_SCOPE && fallbackKind !== 'trash')
  useThumbView(fallbackKind, local ? scopeKey : GLOBAL_SCOPE)
  const items = useThumbnailScopeStore((s) => s.items)
  const loaded = useThumbnailScopeStore((s) => s.loaded)
  const load = useThumbnailScopeStore((s) => s.load)
  const storeToggleId = useThumbnailScopeStore((s) => s.toggleId)
  const storeToggleOptional = useThumbnailScopeStore((s) => s.toggleOptional)
  const storeSetIds = useThumbnailScopeStore((s) => s.setIds)
  const storeReplaceGroup = useThumbnailScopeStore((s) => s.replaceGroup)
  const storeSetAuto = useThumbnailScopeStore((s) => s.setAuto)
  const storeSetMode = useThumbnailScopeStore((s) => s.setMode)
  const pack = useSettingsStore((s) => (local ? s.galleryLocalScopes[scopeKey] ?? LOCAL_SCOPE_DEFAULT : null))
  const globalAuto = useSettingsStore((s) => s.thumbScopeAuto)
  const globalMode = useSettingsStore((s) => s.thumbDisplayMode)
  const galleryFallback = useSettingsStore((s) => s.galleryThumbFallback)
  const trashFallback = useSettingsStore((s) => s.trashThumbFallback)
  const setGalleryThumbFallback = useSettingsStore((s) => s.setGalleryThumbFallback)
  const setTrashThumbFallback = useSettingsStore((s) => s.setTrashThumbFallback)
  const patchLocal = useSettingsStore((s) => s.setGalleryLocalScope)
  const storedIds = useSettingsStore((s) => s.thumbScopeIds)
  const optionalStored = useSettingsStore((s) => s.thumbScopeOptionalIds)
  const auto = local ? Boolean(pack?.auto) : globalAuto
  const mode = local ? (pack?.mode ?? 'likely') : globalMode
  const named = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const rawSelected = auto ? selectedScopeIds(local ? scopeKey : GLOBAL_SCOPE) : local ? pack?.ids ?? [] : storedIds
  const selected = loaded ? rawSelected.filter((id) => named.has(id)) : rawSelected
  const optionalIds = selected.filter((id) => (local ? pack?.optionalIds ?? [] : optionalStored).includes(id))
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

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const leftover = items.filter((item) => item.id !== GLOBAL_SCOPE && !selected.includes(item.id))
    const matched = leftover.filter((item) => {
      if (!needle) {
        return true
      }
      const hay = [item.name, item.group, ...item.anyGroups.flat()].join(' ').toLowerCase()
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

  const fallbackOn = fallbackKind === 'trash' ? trashFallback : fallbackKind ? (local ? Boolean(pack?.fallback) : galleryFallback) : null

  function refreshModels() {
    void useModelsStore.getState().pull()
  }

  function pinLocal(ids: string[]) {
    patchLocal(scopeKey, { ids, auto: false })
    refreshModels()
  }

  function setIds(ids: string[]) {
    if (local) {
      pinLocal(ids)
      return
    }
    storeSetIds(ids)
  }

  function toggleId(id: string) {
    if (!local) {
      storeToggleId(id)
      return
    }
    if (id === GLOBAL_SCOPE) {
      pinLocal([])
      return
    }
    const current = selectedScopeIds(scopeKey)
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    pinLocal(next)
  }

  function replaceGroup(id: string) {
    if (!local) {
      storeReplaceGroup(id)
      return
    }
    const row = items.find((item) => item.id === id)
    if (!row || row.id === GLOBAL_SCOPE) {
      toggleId(id)
      return
    }
    if (selectedScopeIds(scopeKey).includes(id)) {
      toggleId(id)
      return
    }
    const group = row.group.trim().toLowerCase()
    const current = selectedScopeIds(scopeKey).filter((item) => {
      if (item === id) {
        return false
      }
      if (!group) {
        return true
      }
      const other = items.find((entry) => entry.id === item)
      return (other?.group || '').trim().toLowerCase() !== group
    })
    pinLocal([...current, id])
  }

  function setAuto(value: boolean) {
    if (!local) {
      storeSetAuto(value)
      return
    }
    patchLocal(scopeKey, { auto: value })
    if (value) {
      void useThumbnailScopeStore.getState().refreshAuto()
    } else {
      refreshModels()
    }
  }

  function setMode(value: 'likely' | 'exact') {
    if (!local) {
      storeSetMode(value)
      return
    }
    patchLocal(scopeKey, { mode: value })
    refreshModels()
  }

  function toggleOptional(id: string) {
    if (!id || id === GLOBAL_SCOPE) {
      return
    }
    if (!local) {
      storeToggleOptional(id)
      return
    }
    const current = pack?.optionalIds ?? []
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    patchLocal(scopeKey, { optionalIds: next })
    refreshModels()
  }

  function setFallback(value: boolean) {
    if (fallbackKind === 'trash') {
      setTrashThumbFallback(value)
      return
    }
    if (local) {
      patchLocal(scopeKey, { fallback: value })
      refreshModels()
      return
    }
    if (fallbackKind) {
      setGalleryThumbFallback(value)
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
          ) : null}
          <ChipList
            className="flex min-w-0 flex-1 items-center gap-1"
            value={selected}
            onChange={setIds}
            onChipClick={toggleOptional}
            renderChip={(id) => <span className="max-w-40 truncate">{named.get(id)?.name || id}</span>}
            chipLabel={(id) => named.get(id)?.name || id}
            chipTitle={(id) =>
              optionalIds.includes(id) ? 'Optional: click to require' : 'Required: click to make optional'
            }
            chipClassName={(id) => (optionalIds.includes(id) ? 'bg-bg text-muted' : 'bg-accent text-ink')}
          >
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
          </ChipList>
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
