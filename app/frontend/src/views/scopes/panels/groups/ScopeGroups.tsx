import { ConfirmDialog } from '@/components/controls/dialog/Dialog.tsx'
import { ContextMenu, ContextMenuItem } from '@/components/composites/chrome/ContextMenu.tsx'
import { LightboxView } from '@/components/composites/models/LightboxView.tsx'
import { PaneSplitter } from '@/components/controls/resizable-panel/PaneSplitter.tsx'
import { getScopeThumbs, type ScopeThumb, type ThumbScope } from '@/lib/api.ts'
import { GLOBAL_SCOPE } from '@/lib/gallery/thumbView.ts'
import { groupValue, nameKey, orderByIds, placeScope, UNGROUPED } from '@/views/scopes/panels/editor/sections/scopeTree.ts'
import { ScopeFilter } from '@/views/scopes/panels/editor/sections/ScopeFilter.tsx'
import { ScopeGroupDetail } from '@/views/scopes/panels/groups/sections/ScopeGroupDetail.tsx'
import { ScopeGroupList } from '@/views/scopes/panels/groups/sections/ScopeGroupList.tsx'
import { memberThumb, thumbSrc } from '@/views/scopes/panels/groups/sections/scopeGroupUtils.ts'
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

export function ScopeGroups({ onEditScope, active = true }: { onEditScope: (id: string) => void; active?: boolean }) {
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
    if (!active) {
      return
    }
    void getScopeThumbs()
      .then(setThumbs)
      .catch((err) => toast(err instanceof Error ? err.message : 'Could not load thumbnails', 'error'))
  }, [active])

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
        <ScopeGroupList
          listWidth={listWidth}
          groups={groups}
          movable={movable}
          selected={selected}
          moving={moving}
          drag={drag}
          slot={slot}
          groupDrop={groupDrop}
          dragged={dragged}
          scopeDragRef={scopeDragRef}
          onSelect={select}
          onApplyDrop={applyDrop}
          onHoverSlot={hoverSlot}
          onDropScope={(title) => void dropScopeOnGroup(title)}
          onSetDrag={setDrag}
          onSetSlot={setSlot}
          onSetGroupDrop={setGroupDrop}
          onEndDrag={() => {
            setDrag(null)
            setSlot(null)
          }}
        />
        <PaneSplitter
          value={listWidth}
          onChange={setListWidth}
          onReset={() => setListWidth(LIST_REM * remPx())}
          min={LIST_MIN_REM * remPx()}
          containerRef={rowRef}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden pl-4">
          <ScopeGroupDetail
            selected={selected}
            ungrouped={ungrouped}
            name={name}
            busy={busy}
            canSave={canSave}
            dirty={dirty}
            members={members}
            thumbs={thumbs}
            extra={extra}
            optional={optional}
            lit={lit}
            dragged={dragged}
            scopeDragRef={scopeDragRef}
            onName={setName}
            onSave={() => void saveName()}
            onDelete={() => setPending(selected)}
            onMemberClick={(index) => {
              if (index >= 0) {
                setLight(index)
              }
            }}
            onMemberMenu={(x, y, id) => setMenu({ x, y, id })}
            onScopeDragStart={(id) => {
              scopeDragRef.current = id
              setScopeDrag(id)
            }}
            onScopeDragEnd={(id) => {
              setScopeDrag('')
              setGroupDrop('')
              requestAnimationFrame(() => {
                if (scopeDragRef.current === id) {
                  scopeDragRef.current = ''
                }
              })
            }}
          />
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
          src={thumbSrc(lit[light].thumb, true)}
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
