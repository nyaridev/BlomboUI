import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { ChipSelect } from '@/components/primitives/ChipSelect.tsx'
import { ConfirmDialog } from '@/components/primitives/Dialog.tsx'
import { ContextMenu, ContextMenuItem } from '@/components/chrome/ContextMenu.tsx'
import { LightboxView } from '@/components/models/LightboxView.tsx'
import { TilePreview } from '@/components/models/TilePreview.tsx'
import {
  deleteModelThumb,
  getScopeThumbs,
  modelThumbUrl,
  type ScopeThumb,
} from '@/lib/api.ts'
import { GLOBAL_SCOPE } from '@/lib/gallery/thumbView.ts'
import { modelLabel, useModelsStore } from '@/stores/modelsStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useThumbnailScopeStore } from '@/stores/thumbnailScopeStore.ts'
import { toast } from '@/stores/toastStore.ts'
import { ScopeFilter } from './ScopeFilter.tsx'
import { useEffect, useMemo, useState } from 'react'

const KINDS = [
  { id: 'checkpoints' as const, label: 'Base Model' },
  { id: 'loras' as const, label: 'LoRA' },
  { id: 'wildcards' as const, label: 'Wildcards' },
]

type KindId = (typeof KINDS)[number]['id']

function kindLabel(kind: string) {
  return KINDS.find((item) => item.id === kind)?.label || kind
}

function fileName(path: string) {
  return path.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, '') || path
}

function wildcardPath(path: string) {
  const posix = path.replace(/\\/g, '/')
  const hash = posix.indexOf('#')
  if (hash >= 0) {
    return posix.slice(hash + 1) || posix.slice(0, hash).replace(/\.[^/.]+$/, '')
  }
  return posix.replace(/\.[^/.]+$/, '') || posix
}

function itemLabel(kind: string, path: string) {
  if (kind === 'wildcards') {
    return wildcardPath(path)
  }
  return fileName(path) || modelLabel(path)
}

function modelKey(kind: string, path: string) {
  return `${kind}:${path}`
}

function parseModelKey(value: string) {
  const index = value.indexOf(':')
  return { kind: value.slice(0, index), path: value.slice(index + 1) }
}

function matchScopes(row: ScopeThumb, required: string[], optional: string[]) {
  const have = new Set(row.scopes.length ? row.scopes : [GLOBAL_SCOPE])
  if (!required.length && !optional.length) {
    return true
  }
  if (required.length === 1 && required[0] === GLOBAL_SCOPE && optional.length === 0) {
    return have.has(GLOBAL_SCOPE)
  }
  const need = required.filter((id) => id !== GLOBAL_SCOPE)
  if (need.some((id) => !have.has(id))) {
    return false
  }
  if (!need.length && optional.length) {
    return optional.some((id) => have.has(id))
  }
  return true
}

function optionalHits(row: ScopeThumb, optional: string[]) {
  const have = new Set(row.scopes)
  return optional.reduce((sum, id) => sum + (have.has(id) ? 1 : 0), 0)
}

function thumbSrc(row: ScopeThumb, raw = false) {
  return modelThumbUrl(
    row.kind,
    row.path,
    row.mtime || 1,
    { context: row.context, mode: 'exact', raw: raw || undefined },
    row.media,
  )
}

export function ScopeLookup({ onEditScope }: { onEditScope: (id: string) => void }) {
  const items = useThumbnailScopeStore((s) => s.items)
  const loaded = useThumbnailScopeStore((s) => s.loaded)
  const loadScopes = useThumbnailScopeStore((s) => s.load)
  const loadModels = useModelsStore((s) => s.load)
  const pullModels = useModelsStore((s) => s.pull)
  const checkpoints = useModelsStore((s) => s.checkpoints)
  const loras = useModelsStore((s) => s.loras)
  const wildcards = useModelsStore((s) => s.wildcards)
  const [thumbs, setThumbs] = useState<ScopeThumb[]>([])
  const [busy, setBusy] = useState(false)
  const ids = useSettingsStore((s) => s.lookupScopeIds)
  const optionalIds = useSettingsStore((s) => s.lookupScopeOptionalIds)
  const setIds = useSettingsStore((s) => s.setLookupScopeIds)
  const setOptionalIds = useSettingsStore((s) => s.setLookupScopeOptionalIds)
  const kinds = useSettingsStore((s) => s.lookupKinds) as KindId[]
  const models = useSettingsStore((s) => s.lookupModels)
  const setKinds = useSettingsStore((s) => s.setLookupKinds)
  const setModels = useSettingsStore((s) => s.setLookupModels)
  const [pending, setPending] = useState<ScopeThumb | null>(null)
  const [light, setLight] = useState<number | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; row: ScopeThumb } | null>(null)
  const named = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

  useEffect(() => {
    if (!loaded) {
      void loadScopes()
    }
    void loadModels()
  }, [loadModels, loadScopes, loaded])

  async function refresh() {
    setBusy(true)
    try {
      setThumbs(await getScopeThumbs())
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not load thumbnails', 'error')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const required = ids.filter((id) => !optionalIds.includes(id))
  const optional = ids.filter((id) => optionalIds.includes(id))
  const activeKinds = kinds.length ? kinds : KINDS.map((item) => item.id)
  const byKind: Record<KindId, typeof checkpoints> = { checkpoints, loras, wildcards }
  const modelOptions = useMemo(
    () =>
      KINDS.filter((item) => activeKinds.includes(item.id)).map((item) => ({
        title: item.label,
        options: byKind[item.id]
          .filter((row) => !row.dir)
          .map((row) => modelKey(item.id, row.path)),
      })),
    [activeKinds, checkpoints, loras, wildcards],
  )

  const shown = useMemo(() => {
    const picked = new Set(models)
    return thumbs
      .filter((row) => activeKinds.includes(row.kind as KindId))
      .filter((row) => (picked.size ? picked.has(modelKey(row.kind, row.path)) : true))
      .filter((row) => matchScopes(row, required, optional))
      .slice()
      .sort((a, b) => optionalHits(b, optional) - optionalHits(a, optional) || b.mtime - a.mtime)
  }, [thumbs, activeKinds, models, required, optional])

  function scopeLabel(row: ScopeThumb) {
    if (!row.scopes.length) {
      return 'Global'
    }
    return row.scopes.map((id) => named.get(id)?.name || id).join(' + ')
  }

  async function remove(row: ScopeThumb) {
    try {
      await deleteModelThumb(row.kind, row.path, { context: row.context, mode: 'exact' })
      setThumbs((current) =>
        current.filter((item) => !(item.kind === row.kind && item.path === row.path && item.context === row.context)),
      )
      void pullModels()
      setPending(null)
      setLight(null)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not remove thumbnail', 'error')
    }
  }

  function toggleKind(id: KindId) {
    const next = kinds.includes(id) ? kinds.filter((item) => item !== id) : [...kinds, id]
    setKinds(next)
    setModels(
      models.filter((item) => {
        const kind = parseModelKey(item).kind
        return !next.length || next.includes(kind as KindId)
      }),
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <ScopeFilter
        items={items}
        ids={ids}
        optionalIds={optionalIds}
        onIds={setIds}
        onOptional={setOptionalIds}
      />
      <div className="flex min-h-9 shrink-0 items-stretch gap-1">
        {KINDS.map((item) => {
          const on = kinds.includes(item.id)
          return (
            <button
              key={item.id}
              type="button"
              className={[
                'rounded border px-2 text-xs',
                on ? 'border-accent bg-accent text-ink' : 'border-line bg-field text-muted hover:text-ink',
              ].join(' ')}
              aria-pressed={on}
              onClick={() => toggleKind(item.id)}
            >
              {item.label}
            </button>
          )
        })}
        <div className="min-w-0 flex-1">
          <ChipSelect
            options={modelOptions}
            value={models}
            onChange={setModels}
            placeholder="Filter models…"
            chipLabel={(item) => {
              const parsed = parseModelKey(item)
              return itemLabel(parsed.kind, parsed.path)
            }}
          />
        </div>
        <button
          type="button"
          className="flex w-8 shrink-0 items-center justify-center self-stretch rounded border border-line bg-field text-ink disabled:opacity-40 hover:bg-line"
          aria-label="Refresh thumbnails"
          title="Refresh thumbnails"
          disabled={busy}
          onClick={() => void refresh()}
        >
          <AppIcon id="refresh-cw" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {shown.length === 0 ? (
          <p className="text-sm text-muted">{busy ? 'Loading…' : 'No thumbnails match these filters.'}</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,9rem))] gap-3">
            {shown.map((row, index) => (
              <div key={`${row.kind}:${row.path}:${row.context}`}>
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setLight(index)}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    setMenu({ x: event.clientX, y: event.clientY, row })
                  }}
                >
                  <TilePreview
                    className="w-full"
                    src={thumbSrc(row)}
                    rawSrc={thumbSrc(row, true)}
                    mark="?"
                    label={itemLabel(row.kind, row.path)}
                    badge={kindLabel(row.kind)}
                  />
                </button>
                <p className="mt-1 truncate text-[11px] text-muted" title={scopeLabel(row)}>
                  {scopeLabel(row)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
      {pending ? (
        <ConfirmDialog
          title="Remove thumbnail?"
          body={`This deletes the ${kindLabel(pending.kind)} thumbnail saved for ${scopeLabel(pending)}.`}
          onClose={() => setPending(null)}
          actions={[
            { label: 'Cancel', onClick: () => setPending(null) },
            {
              label: 'Remove',
              kind: 'primary',
              danger: true,
              onClick: () => void remove(pending),
            },
          ]}
        />
      ) : null}
      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          {menu.row.scopes.map((id) => (
            <ContextMenuItem
              key={id}
              label={menu.row.scopes.length > 1 ? `Edit ${named.get(id)?.name || 'scope'}` : 'Edit scope'}
              onClick={() => {
                onEditScope(id)
                setMenu(null)
              }}
            />
          ))}
          <ContextMenuItem
            label={`Filter by ${itemLabel(menu.row.kind, menu.row.path)}`}
            onClick={() => {
              const key = modelKey(menu.row.kind, menu.row.path)
              if (!models.includes(key)) {
                setModels([...models, key])
              }
              if (kinds.length && !kinds.includes(menu.row.kind as KindId)) {
                setKinds([...kinds, menu.row.kind as KindId])
              }
              setMenu(null)
            }}
          />
          <ContextMenuItem
            label="Remove thumbnail"
            danger
            onClick={() => {
              setPending(menu.row)
              setMenu(null)
            }}
          />
        </ContextMenu>
      ) : null}
      {light != null && shown[light] ? (
        <LightboxView
          src={thumbSrc(shown[light], true)}
          alt={itemLabel(shown[light].kind, shown[light].path)}
          resetKey={`${shown[light].kind}:${shown[light].path}:${shown[light].context}`}
          many={shown.length > 1}
          onClose={() => setLight(null)}
          onPrev={() => setLight((index) => (index == null ? 0 : (index + shown.length - 1) % shown.length))}
          onNext={() => setLight((index) => (index == null ? 0 : (index + 1) % shown.length))}
        />
      ) : null}
    </div>
  )
}
