import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { FloatingModelsView } from '@/components/composites/models/FloatingModelsView.tsx'
import { TilePreview } from '@/components/composites/models/TilePreview.tsx'
import { modelThumbSrc } from '@/lib/gallery/thumbView.ts'
import type { ModelEntry, ModelLists } from '@/lib/api.ts'
import { galleryScopeKey } from '@/stores/settings/constants.ts'
import { modelLabel, modelPath, useModelsStore } from '@/stores/modelsStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useThumbView } from '@/stores/thumbnailScopeStore.ts'
import { useEffect, useMemo, useRef, useState } from 'react'

type ModelPickTileProps = {
  kind: keyof ModelLists
  role: string
  value: string
  onChange: (value: string) => void
  onClear?: () => void
  disabled?: boolean
  chromeKey?: string
  size?: 'row' | 'tall'
}

export function ModelPickTile({
  kind,
  role,
  value,
  onChange,
  onClear,
  disabled = false,
  chromeKey,
  size = 'row',
}: ModelPickTileProps) {
  const items = useModelsStore((s) => s[kind])
  const load = useModelsStore((s) => s.load)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const item = useMemo(() => findModel(items, value), [items, value])
  const empty = !value
  const unresolved = Boolean(value) && !item
  const name = empty ? role : modelLabel(value) || value
  const scopeKey = useSettingsStore((s) => (chromeKey ? galleryScopeKey(chromeKey, s) : undefined))
  const view = useThumbView(kind, scopeKey)

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!value || item || !items.length) {
      return
    }
    const hits = matchPaths(items, value)
    if (hits.length === 1) {
      onChange(hits[0])
    }
  }, [item, items, onChange, value])

  function show() {
    if (disabled) {
      return
    }
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) {
      return
    }
    setAnchor(rect)
    setOpen(true)
  }

  function clear(event: { preventDefault(): void; stopPropagation(): void }) {
    event.preventDefault()
    event.stopPropagation()
    onClear?.()
  }

  return (
    <>
      {size === 'tall' ? (
        <div className="group relative w-28 shrink-0">
          <button
            ref={triggerRef}
            type="button"
            disabled={disabled}
            title={empty ? `Add ${role}` : name}
            className={[
              'relative block w-28 overflow-hidden transition duration-150 ease-out',
              disabled ? 'cursor-default' : 'hover:brightness-110',
            ].join(' ')}
            onClick={() => (open ? setOpen(false) : show())}
          >
            <TilePreview
              src={empty || unresolved || !item ? null : modelThumbSrc(kind, item, view)}
              mark={empty ? '' : unresolved ? '?' : ''}
              label={!empty ? name : undefined}
              eager
              className="w-28 [&_img]:origin-center [&_img]:transition-transform [&_img]:duration-200 [&_img]:ease-out group-hover:[&_img]:scale-110"
            />
            {empty ? (
              <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-muted">
                <AppIcon id="plus" size={22} />
              </span>
            ) : null}
          </button>
          {onClear && !empty && !disabled ? (
            <button
              type="button"
              className="absolute top-1 right-1 z-20 flex h-5 w-5 items-center justify-center rounded bg-bg/70 text-muted opacity-0 hover:bg-red hover:text-ink group-hover:opacity-100"
              aria-label={`Clear ${role}`}
              onClick={clear}
            >
              <AppIcon id="x" size={12} />
            </button>
          ) : null}
        </div>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          title={empty ? `Choose ${role}` : name}
          className={[
            'group flex min-w-0 items-center gap-cluster rounded border border-line bg-field px-1.5 py-1 text-left',
            disabled ? 'cursor-default opacity-60' : 'hover:bg-line',
          ].join(' ')}
          onClick={() => (open ? setOpen(false) : show())}
        >
          <span className="relative w-10 shrink-0">
            <TilePreview
              src={item ? modelThumbSrc(kind, item, view) : null}
              mark={empty ? '' : unresolved ? '?' : ''}
              eager
              className="w-10"
            />
            {empty ? (
              <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-muted">
                <AppIcon id="plus" size={14} />
              </span>
            ) : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] uppercase tracking-wide text-muted">{role}</span>
            <span className="block truncate text-sm text-ink">{empty ? `Choose ${role}` : name}</span>
          </span>
          {onClear && !empty ? (
            <span
              role="button"
              tabIndex={0}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:bg-line hover:text-ink"
              aria-label={`Clear ${role}`}
              onClick={clear}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  clear(event)
                }
              }}
            >
              <AppIcon id="x" size={12} />
            </span>
          ) : null}
        </button>
      )}
      {open && anchor ? (
        <FloatingModelsView
          kind={kind}
          value={value}
          chromeKey={chromeKey}
          anchor={anchor}
          onSelect={onChange}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}

function findModel(items: ModelEntry[], path: string) {
  if (!path) {
    return undefined
  }
  return items.find((item) => item.path === path)
}

function matchPaths(items: ModelEntry[], value: string) {
  const base = value.split(/[\\/]/).pop()
  if (!base) {
    return []
  }
  return items.map(modelPath).filter((id) => id.split(/[\\/]/).pop() === base)
}
