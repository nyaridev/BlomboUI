import { FloatingScopeView } from '@/components/composites/models/FloatingScopeView.tsx'
import { ChipList } from '@/components/controls/chip-list/ChipList.tsx'
import { GLOBAL_SCOPE } from '@/lib/gallery/thumbView.ts'
import { useMemo, useRef, useState } from 'react'

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
  const field = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const named = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

  function close() {
    setOpen(false)
    setQuery('')
  }

  function pick(id: string) {
    if (id === GLOBAL_SCOPE) {
      onIds(ids.length === 1 && ids[0] === GLOBAL_SCOPE ? [] : [GLOBAL_SCOPE])
      onOptional([])
      return
    }
    const next = ids.filter((item) => item !== GLOBAL_SCOPE)
    if (next.includes(id)) {
      onIds(next.filter((item) => item !== id))
      onOptional(optionalIds.filter((item) => item !== id))
      return
    }
    onIds([...next, id])
  }

  function toggleOptional(id: string) {
    if (id === GLOBAL_SCOPE) {
      return
    }
    onOptional(optionalIds.includes(id) ? optionalIds.filter((item) => item !== id) : [...optionalIds, id])
  }

  return (
    <div className="relative flex h-8 min-w-0 shrink-0 items-stretch">
      <div
        ref={field}
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
      {open && field.current ? (
        <FloatingScopeView
          anchor={field.current.getBoundingClientRect()}
          selected={ids}
          onSelect={pick}
          onClose={close}
          query={query}
          onQuery={setQuery}
          retain={field}
          emptyMeansGlobal={false}
        />
      ) : null}
    </div>
  )
}
