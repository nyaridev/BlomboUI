import { AppIcon } from '@/components/AppIcon.tsx'
import { ConfirmDialog } from '@/components/Dialog.tsx'
import { ContextMenu, ContextMenuItem } from '@/components/ContextMenu.tsx'
import { LightboxView } from '@/components/LightboxView.tsx'
import { PaneSplitter } from '@/components/PaneSplitter.tsx'
import { TilePreview } from '@/components/TilePreview.tsx'
import { getScopeThumbs, modelThumbUrl, type ScopeThumb, type ThumbScope } from '@/lib/api.ts'
import { GLOBAL_SCOPE } from '@/lib/thumbView.ts'
import { groupValue, nameKey, orderByIds, placeScope, UNGROUPED } from './scopeTree.ts'
import { ScopeFilter } from './ScopeFilter.tsx'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useThumbnailScopeStore } from '@/stores/thumbnailScopeStore.ts'
import { toast } from '@/stores/toastStore.ts'
import { useEffect, useMemo, useRef, useState } from 'react'

const LIST_REM = 18
const LIST_MIN_REM = 12

function remPx() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

function groupList(items: ThumbScope[], order: string[], keep = '', emptyUngrouped = false) {
  const used = new Set<string>()
  const names: string[] = []
  const counts = new Map<string, number>()
  let ungrouped = 0
  for (const item of items) {
    if (item.id === GLOBAL_SCOPE) {
      continue
    }
    const group = item.group.trim()
    if (!group) {
      ungrouped += 1
      continue
    }
    const key = nameKey(group)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  for (const name of order) {
    const text = name.trim()
    if (!text || used.has(nameKey(text))) {
      continue
    }
    used.add(nameKey(text))
    const keepThis = keep && nameKey(keep) === nameKey(text)
    if ((counts.get(nameKey(text)) || 0) > 0 || keepThis) {
      names.push(text)
    }
  }
  const extra = new Set<string>()
  for (const item of items) {
    if (item.id === GLOBAL_SCOPE) {
      continue
    }
    const group = item.group.trim()
    if (!group || used.has(nameKey(group))) {
      continue
    }
    extra.add(group)
    used.add(nameKey(group))
  }
  names.push(...[...extra].sort((a, b) => a.localeCompare(b)))
  if (ungrouped > 0 || emptyUngrouped || keep === UNGROUPED) {
    names.push(UNGROUPED)
  }
  return names
}

function memberThumb(scopeId: string, thumbs: ScopeThumb[], extra: string[], optional: string[]) {
  const need = [...new Set([scopeId, ...extra.filter((id) => id && id !== GLOBAL_SCOPE && id !== scopeId)])]
  const strict = extra.length === 0 && optional.length === 0
  let best: ScopeThumb | null = null
  let bestHits = -1
  let bestExtra = Infinity
  for (const row of thumbs) {
    const have = new Set(row.scopes)
    if (need.some((id) => !have.has(id))) {
      continue
    }
    if (strict && row.context !== scopeId && !(row.scopes.length === 1 && row.scopes[0] === scopeId)) {
      continue
    }
    const hits = optional.reduce((sum, id) => sum + (have.has(id) ? 1 : 0), 0)
    const leftover = have.size - need.length
    if (
      !best ||
      hits > bestHits ||
      (hits === bestHits && leftover < bestExtra) ||
      (hits === bestHits && leftover === bestExtra && row.mtime > best.mtime)
    ) {
      best = row
      bestHits = hits
      bestExtra = leftover
    }
  }
  return best
}

function thumbSrc(thumb: ScopeThumb) {
  return modelThumbUrl(
    thumb.kind,
    thumb.path,
    thumb.mtime || 1,
    { context: thumb.context, mode: 'exact' },
    thumb.media,
  )
}

export function ScopeGroups({ onEditScope }: { onEditScope: (id: string) => void }) {
  const items = useThumbnailScopeStore((s) => s.items)
  const loaded = useThumbnailScopeStore((s) => s.loaded)
  const load = useThumbnailScopeStore((s) => s.load)
  const update = useThumbnailScopeStore((s) => s.update)
  const scopeGroups = useSettingsStore((s) => s.scopeGroups)
  const setScopeGroups = useSettingsStore((s) => s.setScopeGroups)
  const scopeOrder = useSettingsStore((s) => s.scopeOrder) || []
  const setScopeOrder = useSettingsStore((s) => s.setScopeOrder)
  const ids = useSettingsStore((s) => s.lookupScopeIds)
  const optionalIds = useSettingsStore((s) => s.lookupScopeOptionalIds)
  const setIds = useSettingsStore((s) => s.setLookupScopeIds)
  const setOptionalIds = useSettingsStore((s) => s.setLookupScopeOptionalIds)
  const rowRef = useRef<HTMLDivElement>(null)
  const [listWidth, setListWidth] = useState(() => LIST_REM * 16)
  const [open, setOpen] = useState('')
  const [name, setName] = useState('')
  const [thumbs, setThumbs] = useState<ScopeThumb[]>([])
  const [pending, setPending] = useState('')
  const [busy, setBusy] = useState(false)
  const [light, setLight] = useState<number | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const [slot, setSlot] = useState<number | null>(null)
  const [scopeDrag, setScopeDrag] = useState('')
  const [groupDrop, setGroupDrop] = useState('')
  const dragged = useRef(false)
  const scopeDragRef = useRef('')

  useEffect(() => {
    if (!loaded) {
      void load()
    }
  }, [load, loaded])

  useEffect(() => {
    setListWidth(LIST_REM * remPx())
  }, [])

  useEffect(() => {
    void getScopeThumbs()
      .then(setThumbs)
      .catch((err) => toast(err instanceof Error ? err.message : 'Could not load thumbnails', 'error'))
  }, [])

  const groups = useMemo(
    () => groupList(items, scopeGroups, open, Boolean(scopeDrag)),
    [items, open, scopeDrag, scopeGroups],
  )
  const movable = groups.filter((item) => item !== UNGROUPED)
  const selected = open && groups.includes(open) ? open : groups[0] || ''
  const ungrouped = selected === UNGROUPED
  const members = useMemo(() => {
    if (!selected) {
      return []
    }
    return orderByIds(
      items.filter((item) => {
        if (item.id === GLOBAL_SCOPE) {
          return false
        }
        const group = item.group.trim()
        if (ungrouped) {
          return !group
        }
        return nameKey(group) === nameKey(selected)
      }),
      scopeOrder,
    )
  }, [items, scopeOrder, selected, ungrouped])

  const extra = ids.filter((id) => id !== GLOBAL_SCOPE && !optionalIds.includes(id))
  const optional = ids.filter((id) => id !== GLOBAL_SCOPE && optionalIds.includes(id))

  useEffect(() => {
    setName(ungrouped ? UNGROUPED : selected)
    setLight(null)
  }, [selected, ungrouped])

  function select(title: string) {
    setOpen(title)
    setName(title === UNGROUPED ? UNGROUPED : title)
  }

  async function saveName() {
    const next = name.trim()
    if (ungrouped || !selected || !next || nameKey(next) === nameKey(selected)) {
      return
    }
    if (nameKey(next) === nameKey(UNGROUPED) || groups.some((item) => item !== selected && nameKey(item) === nameKey(next))) {
      toast('Group already exists', 'error')
      return
    }
    setBusy(true)
    try {
      for (const item of members) {
        await update(item.id, {
          name: item.name,
          group: next,
          anyGroups: item.anyGroups,
          exclude: item.exclude,
          priority: item.priority,
        })
      }
      if (scopeGroups.some((item) => nameKey(item) === nameKey(selected))) {
        setScopeGroups(scopeGroups.map((item) => (nameKey(item) === nameKey(selected) ? next : item)))
      } else {
        setScopeGroups([...scopeGroups, next])
      }
      setOpen(next)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not rename group', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function drop() {
    if (ungrouped || !selected) {
      return
    }
    setBusy(true)
    try {
      for (const item of members) {
        await update(item.id, {
          name: item.name,
          group: '',
          anyGroups: item.anyGroups,
          exclude: item.exclude,
          priority: item.priority,
        })
      }
      setScopeGroups(scopeGroups.filter((item) => nameKey(item) !== nameKey(selected)))
      setPending('')
      setOpen('')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not delete group', 'error')
    } finally {
      setBusy(false)
    }
  }

  const dirty = !ungrouped && name.trim() !== selected
  const canSave = dirty && Boolean(name.trim()) && !busy
  const moving = drag !== null && slot !== null && slot !== drag && slot !== drag + 1

  function applyDrop() {
    if (!moving || drag === null || slot === null) {
      return
    }
    const next = [...movable]
    const [item] = next.splice(drag, 1)
    next.splice(drag < slot ? slot - 1 : slot, 0, item)
    setScopeGroups(next)
    setDrag(null)
    setSlot(null)
  }

  function hoverSlot(index: number) {
    if (scopeDrag || drag === null) {
      return
    }
    setSlot(index === drag ? drag : index < drag ? index : index + 1)
  }

  async function dropScopeOnGroup(title: string) {
    const id = scopeDragRef.current
    scopeDragRef.current = ''
    setScopeDrag('')
    setGroupDrop('')
    if (!id) {
      return
    }
    const item = items.find((row) => row.id === id)
    if (!item) {
      return
    }
    const nextGroup = groupValue(title)
    const ids = placeScope(items, scopeGroups, scopeOrder, id, title, 999)
    setScopeOrder(ids)
    if (item.group.trim() === nextGroup) {
      return
    }
    try {
      await update(id, {
        name: item.name,
        group: nextGroup,
        anyGroups: item.anyGroups,
        exclude: item.exclude,
        priority: item.priority,
      })
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not move scope', 'error')
    }
  }

  const lit = members
    .map((item) => {
      const thumb = memberThumb(item.id, thumbs, extra, optional)
      return thumb ? { item, thumb } : null
    })
    .filter((row): row is { item: ThumbScope; thumb: ScopeThumb } => row != null)

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <ScopeFilter items={items} ids={ids} optionalIds={optionalIds} onIds={setIds} onOptional={setOptionalIds} />
      <div ref={rowRef} className="flex min-h-0 flex-1">
        <div
          className="flex min-h-0 shrink-0 flex-col gap-1 overflow-y-auto pr-1"
          style={{ width: listWidth }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            if (scopeDragRef.current) {
              return
            }
            applyDrop()
          }}
        >
          {movable.map((item, index) => (
            <div key={item}>
              {moving && slot === index ? <span className="mb-1 block h-0.5 rounded-full bg-accent" /> : null}
              <div
                draggable
                className={[
                  'flex cursor-grab items-center rounded border active:cursor-grabbing',
                  groupDrop === item
                    ? 'border-accent bg-accent/20 text-ink'
                    : item === selected
                      ? 'border-accent bg-line text-ink'
                      : 'border-line bg-field text-ink',
                  drag === index ? 'opacity-20' : '',
                ].join(' ')}
                onClick={() => {
                  if (dragged.current) {
                    return
                  }
                  select(item)
                }}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', item)
                  dragged.current = true
                  setDrag(index)
                  setSlot(index)
                }}
                onDragEnd={() => {
                  setDrag(null)
                  setSlot(null)
                  requestAnimationFrame(() => {
                    dragged.current = false
                  })
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  if (scopeDragRef.current) {
                    setGroupDrop(item)
                    return
                  }
                  hoverSlot(index)
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node) && groupDrop === item) {
                    setGroupDrop('')
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  if (scopeDragRef.current) {
                    void dropScopeOnGroup(item)
                    return
                  }
                  applyDrop()
                }}
              >
                <span className="min-w-0 flex-1 truncate py-1.5 pl-2 text-sm">{item}</span>
                <span className="flex h-8 w-5 shrink-0 items-center justify-center text-muted">
                  <AppIcon id="grip-vertical" size={12} />
                </span>
              </div>
            </div>
          ))}
          {moving && slot === movable.length ? <span className="h-0.5 rounded-full bg-accent" /> : null}
          {groups.includes(UNGROUPED) ? (
            <button
              type="button"
              className={[
                'flex items-center justify-between rounded border px-2 py-1.5 text-left text-sm',
                groupDrop === UNGROUPED
                  ? 'border-accent bg-accent/20 text-ink'
                  : selected === UNGROUPED
                    ? 'border-accent bg-line text-ink'
                    : 'border-line bg-field text-ink',
              ].join(' ')}
              onClick={() => select(UNGROUPED)}
              onDragOver={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (scopeDragRef.current) {
                  setGroupDrop(UNGROUPED)
                  return
                }
                if (drag !== null) {
                  setSlot(movable.length)
                }
              }}
              onDrop={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (scopeDragRef.current) {
                  void dropScopeOnGroup(UNGROUPED)
                  return
                }
                applyDrop()
              }}
            >
              <span className="min-w-0 truncate">{UNGROUPED}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted">Default</span>
            </button>
          ) : null}
          {groups.length === 0 ? <p className="px-1 text-sm text-muted">No groups yet.</p> : null}
        </div>
        <PaneSplitter
          value={listWidth}
          onChange={setListWidth}
          onReset={() => setListWidth(LIST_REM * remPx())}
          min={LIST_MIN_REM * remPx()}
          containerRef={rowRef}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden pl-4">
          {selected ? (
            <>
              <div className="flex shrink-0 items-end gap-1">
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
                  Name
                  <input
                    className="h-8 rounded border border-line bg-field px-2 text-sm text-ink outline-none focus:border-accent disabled:opacity-50"
                    value={name}
                    disabled={ungrouped}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                {ungrouped ? null : (
                  <>
                    <button
                      type="button"
                      className="h-8 rounded bg-accent px-2 text-xs text-ink disabled:opacity-40"
                      disabled={!canSave}
                      onClick={() => void saveName()}
                    >
                      {dirty ? 'Save' : 'Saved'}
                    </button>
                    <button
                      type="button"
                      className="h-8 rounded border border-line px-2 text-xs text-ink disabled:opacity-40"
                      disabled={busy}
                      onClick={() => setPending(selected)}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {members.length === 0 ? (
                  <p className="text-sm text-muted">No scopes in this group.</p>
                ) : (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,9rem))] gap-3">
                    {members.map((item) => {
                      const thumb = memberThumb(item.id, thumbs, extra, optional)
                      const src = thumb ? thumbSrc(thumb) : null
                      return (
                        <button
                          key={item.id}
                          type="button"
                          draggable
                          className={['text-left', scopeDrag === item.id ? 'opacity-20' : ''].join(' ')}
                          onClick={() => {
                            if (dragged.current) {
                              return
                            }
                            const index = lit.findIndex((row) => row.item.id === item.id)
                            if (index >= 0) {
                              setLight(index)
                            }
                          }}
                          onContextMenu={(event) => {
                            event.preventDefault()
                            setMenu({ x: event.clientX, y: event.clientY, id: item.id })
                          }}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = 'move'
                            event.dataTransfer.setData('text/plain', item.id)
                            dragged.current = true
                            scopeDragRef.current = item.id
                            setScopeDrag(item.id)
                          }}
                          onDragEnd={() => {
                            setScopeDrag('')
                            setGroupDrop('')
                            requestAnimationFrame(() => {
                              dragged.current = false
                              if (scopeDragRef.current === item.id) {
                                scopeDragRef.current = ''
                              }
                            })
                          }}
                        >
                          <TilePreview className="w-full" src={src} mark="?" label={item.name} />
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">Select a group.</p>
          )}
        </div>
      </div>
      {pending ? (
        <ConfirmDialog
          title="Delete group?"
          body="Scopes in this group move to Ungrouped. The scopes themselves stay."
          onClose={() => setPending('')}
          actions={[
            { label: 'Cancel', onClick: () => setPending('') },
            { label: 'Delete', kind: 'primary', danger: true, onClick: () => void drop() },
          ]}
        />
      ) : null}
      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <ContextMenuItem
            label="Edit scope"
            onClick={() => {
              onEditScope(menu.id)
              setMenu(null)
            }}
          />
        </ContextMenu>
      ) : null}
      {light != null && lit[light] ? (
        <LightboxView
          src={thumbSrc(lit[light].thumb)}
          alt={lit[light].item.name}
          resetKey={lit[light].item.id}
          many={lit.length > 1}
          onClose={() => setLight(null)}
          onPrev={() => setLight((index) => (index == null ? 0 : (index + lit.length - 1) % lit.length))}
          onNext={() => setLight((index) => (index == null ? 0 : (index + 1) % lit.length))}
        />
      ) : null}
    </div>
  )
}
