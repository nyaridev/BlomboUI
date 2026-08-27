import { ChipList } from '@/components/controls/chip-list/ChipList.tsx'
import { GLOBAL_SCOPE } from '@/lib/gallery/thumbView.ts'
import { useEffect, useMemo, useRef, useState } from 'react'

export function ScopeFilter({
  items,
  ids,
  optionalIds,
  onIds,
  onOptional,
}: {
  items: { id: string; name: string; group: string; anyGroups: string[][] }[]
  ids: string[]
  optionalIds: string[]
  onIds: (value: string[]) => void
  onOptional: (value: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const named = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

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
    const leftover = items.filter((item) => item.id !== GLOBAL_SCOPE && !ids.includes(item.id))
    const matched = leftover.filter((item) => {
      if (!needle) {
        return true
      }
      return [item.name, item.group, ...item.anyGroups.flat()].join(' ').toLowerCase().includes(needle)
    })
    const groups = new Map<string, typeof matched>()
    for (const item of matched) {
      const key = item.group.trim() || 'Ungrouped'
      const list = groups.get(key) || []
      list.push(item)
      groups.set(key, list)
    }
    return [...groups.entries()]
  }, [ids, items, query])

  function add(id: string) {
    if (id === GLOBAL_SCOPE) {
      onIds(ids.length === 1 && ids[0] === GLOBAL_SCOPE ? [] : [GLOBAL_SCOPE])
      onOptional([])
      setQuery('')
      return
    }
    const next = ids.filter((item) => item !== GLOBAL_SCOPE)
    if (!next.includes(id)) {
      onIds([...next, id])
    }
    setQuery('')
  }

  function toggleOptional(id: string) {
    if (id === GLOBAL_SCOPE) {
      return
    }
    onOptional(optionalIds.includes(id) ? optionalIds.filter((item) => item !== id) : [...optionalIds, id])
  }

  return (
    <div ref={root} className="relative flex h-8 min-w-0 shrink-0 items-stretch">
      <div
        className="flex min-w-0 flex-1 cursor-text items-center gap-1 overflow-hidden rounded border border-line bg-field px-1.5 focus-within:border-accent"
        onClick={() => {
          input.current?.focus()
          setOpen(true)
        }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {ids.length === 0 ? <span className="shrink-0 text-xs text-muted">All scopes</span> : null}
          <ChipList
            className="flex min-w-0 flex-1 items-center gap-1"
            value={ids}
            onChange={onIds}
            onChipClick={toggleOptional}
            renderChip={(id) => <span className="max-w-40 truncate">{named.get(id)?.name || 'Global'}</span>}
            chipLabel={(id) => named.get(id)?.name || 'Global'}
            chipTitle={(id) =>
              id === GLOBAL_SCOPE
                ? 'Global thumbnails only'
                : optionalIds.includes(id)
                  ? 'Optional: click to require'
                  : 'Required: click to make optional'
            }
            chipClassName={(id) =>
              id === GLOBAL_SCOPE || !optionalIds.includes(id) ? 'bg-accent text-ink' : 'bg-bg text-muted'
            }
          >
            <input
              ref={input}
              className="min-w-16 flex-1 bg-transparent py-0.5 text-xs text-ink outline-none"
              value={query}
              placeholder={ids.length === 0 ? 'Filter scopes…' : ''}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => {
                setQuery(event.target.value)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={(event) => {
                if (event.key !== 'Backspace' || query || ids.length === 0) {
                  return
                }
                event.preventDefault()
                onIds(ids.slice(0, -1))
              }}
              onClick={(event) => event.stopPropagation()}
            />
          </ChipList>
        </div>
      </div>
      {open ? (
        <ul className="select-menu">
          <li>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => add(GLOBAL_SCOPE)}>
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
                      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => add(item.id)}>
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
