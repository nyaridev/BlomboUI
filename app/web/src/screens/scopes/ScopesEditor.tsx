import { AppIcon } from '@/components/AppIcon.tsx'
import { ConfirmDialog } from '@/components/Dialog.tsx'
import { PaneSplitter } from '@/components/PaneSplitter.tsx'
import { GLOBAL_SCOPE } from '@/lib/thumbView.ts'
import { type ThumbScope } from '@/lib/api.ts'
import { useGenerateStore } from '@/stores/generateStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useThumbnailScopeStore } from '@/stores/thumbnailScopeStore.ts'
import { toast } from '@/stores/toastStore.ts'
import { ScopeEditor } from './ScopeEditor.tsx'
import { groupedScopes, groupValue, nameKey, placeScope, UNGROUPED } from './scopeTree.ts'
import { useEffect, useMemo, useRef, useState } from 'react'

const LIST_REM = 18
const LIST_MIN_REM = 12

function remPx() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

function promptTags(text: string) {
  const out: string[] = []
  for (const chunk of text.split(/[,.\n]+/)) {
    const tag = chunk.replace(/[()]/g, ' ').replace(/:\s*[-+]?\d+(?:\.\d+)?/g, ' ').replaceAll('_', ' ').trim().toLowerCase()
    if (!tag || out.includes(tag)) {
      continue
    }
    out.push(tag)
  }
  return out
}

function duplicateNames(items: ThumbScope[]) {
  const counts = new Map<string, number>()
  for (const item of items) {
    const key = nameKey(item.name)
    if (!key) {
      continue
    }
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key))
}

export function ScopesEditor({
  openId,
  onOpenId,
}: {
  openId: string
  onOpenId: (id: string) => void
}) {
  const items = useThumbnailScopeStore((s) => s.items)
  const loaded = useThumbnailScopeStore((s) => s.loaded)
  const load = useThumbnailScopeStore((s) => s.load)
  const create = useThumbnailScopeStore((s) => s.create)
  const update = useThumbnailScopeStore((s) => s.update)
  const remove = useThumbnailScopeStore((s) => s.remove)
  const scopeGroups = useSettingsStore((s) => s.scopeGroups)
  const setScopeGroups = useSettingsStore((s) => s.setScopeGroups)
  const scopeOrder = useSettingsStore((s) => s.scopeOrder) || []
  const setScopeOrder = useSettingsStore((s) => s.setScopeOrder)
  const search = useSettingsStore((s) => s.scopeSearch)
  const setSearch = useSettingsStore((s) => s.setScopeSearch)
  const prompt = useGenerateStore((s) => s.prompt)
  const rowRef = useRef<HTMLDivElement>(null)
  const [listWidth, setListWidth] = useState(() => LIST_REM * 16)
  const [pending, setPending] = useState('')
  const [draftName, setDraftName] = useState('')
  const [creating, setCreating] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [dragId, setDragId] = useState('')
  const [drop, setDrop] = useState<{ title: string; index: number; header?: boolean } | null>(null)
  const dragRef = useRef({ id: '', title: '', index: 0 })
  const dragged = useRef(false)

  useEffect(() => {
    if (!loaded) {
      void load()
    }
  }, [load, loaded])

  useEffect(() => {
    setListWidth(LIST_REM * remPx())
  }, [])

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return items.filter((item) => {
      if (!needle) {
        return true
      }
      return [item.name, item.group, ...item.anyGroups.flat()].join(' ').toLowerCase().includes(needle)
    })
  }, [items, search])
  const dupes = useMemo(() => duplicateNames(items), [items])
  const filtering = Boolean(search.trim())
  const sections = useMemo(
    () => groupedScopes(filtering ? shown : items, scopeGroups, scopeOrder, Boolean(dragId)),
    [dragId, filtering, items, scopeGroups, scopeOrder, shown],
  )
  const open = items.find((item) => item.id === openId)
  const groupOptions = useMemo(() => {
    const names = [...scopeGroups]
    for (const item of items) {
      const group = item.group.trim()
      if (group && !names.some((name) => name.toLowerCase() === group.toLowerCase())) {
        names.push(group)
      }
    }
    return [{ value: '', label: UNGROUPED }, ...names.map((name) => ({ value: name, label: name }))]
  }, [items, scopeGroups])

  function toggleGroup(title: string) {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(title)) {
        next.delete(title)
      } else {
        next.add(title)
      }
      return next
    })
  }

  function ensureGroup(name: string) {
    const text = name.trim()
    if (!text) {
      return
    }
    if (scopeGroups.some((item) => item.toLowerCase() === text.toLowerCase())) {
      return
    }
    setScopeGroups([...scopeGroups, text])
  }

  function hoverDrop(title: string, index: number, header = false) {
    const id = dragId || dragRef.current.id
    if (!id || !title) {
      return
    }
    dragRef.current = { id, title, index }
    setDrop({ title, index, header })
  }

  async function applyScopeDrop() {
    const { id, title, index } = dragRef.current
    setDragId('')
    setDrop(null)
    dragRef.current = { id: '', title: '', index: 0 }
    if (!id || !title) {
      return
    }
    const item = items.find((row) => row.id === id)
    if (!item || item.id === GLOBAL_SCOPE) {
      return
    }
    const nextGroup = groupValue(title)
    const ids = placeScope(items, scopeGroups, scopeOrder, id, title, index)
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

  async function add(tags: string[] = []) {
    const name = draftName.trim() || tags[0] || ''
    if (!name) {
      toast('Name is required', 'error')
      return
    }
    setCreating(true)
    try {
      const anyGroups = tags.length ? tags.map((tag) => [tag]) : [[name]]
      const row = await create({ name, anyGroups })
      setDraftName('')
      onOpenId(row.id)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not create scope', 'error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex h-8 shrink-0 items-stretch gap-1">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-muted">
            <AppIcon id="search" size={12} />
          </span>
          <input
            className="h-full w-full rounded border border-line bg-field py-0 pr-2 pl-7 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search scopes…"
          />
        </div>
      </div>
      <div className="mb-2 flex h-8 shrink-0 items-stretch gap-1">
        <input
          className="h-full min-w-0 flex-1 rounded border border-line bg-field px-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          placeholder="New scope name…"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void add()
            }
          }}
        />
        <button
          type="button"
          className="rounded bg-accent px-2 text-xs text-ink disabled:opacity-40"
          disabled={creating}
          onClick={() => void add()}
        >
          Create
        </button>
        <button
          type="button"
          className="rounded border border-line px-2 text-xs text-ink disabled:opacity-40"
          disabled={creating}
          title="Create from current prompt"
          onClick={() => void add(promptTags(prompt))}
        >
          From prompt
        </button>
      </div>
      <div ref={rowRef} className="flex min-h-0 flex-1">
        <div className="flex min-h-0 shrink-0 flex-col gap-2 overflow-y-auto pr-1" style={{ width: listWidth }}>
          {sections.map((section) => {
            const closed = Boolean(section.title) && collapsed.has(section.title)
            const overHeader = Boolean(dragId && drop?.header && drop.title === section.title)
            const onSection = Boolean(dragId && drop && drop.title === section.title)
            return (
              <div
                key={section.title || GLOBAL_SCOPE}
                className="flex flex-col gap-1"
                onDragOver={(event) => {
                  if (!dragId || !section.title) {
                    return
                  }
                  event.preventDefault()
                  hoverDrop(section.title, section.items.length, true)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  if (!section.title) {
                    return
                  }
                  void applyScopeDrop()
                }}
              >
                {section.title ? (
                  <button
                    type="button"
                    className={[
                      'flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[10px] tracking-[0.12em] uppercase',
                      overHeader ? 'bg-accent/30 text-ink' : 'text-muted',
                    ].join(' ')}
                    onClick={() => toggleGroup(section.title)}
                    onDragOver={(event) => {
                      if (!dragId) {
                        return
                      }
                      event.preventDefault()
                      event.stopPropagation()
                      hoverDrop(section.title, section.items.length, true)
                    }}
                  >
                    <AppIcon id={closed ? 'chevron-right' : 'chevron-down'} size={12} />
                    <span className="min-w-0 flex-1 truncate">{section.title}</span>
                    <span>{section.items.length}</span>
                  </button>
                ) : null}
                {closed
                  ? null
                  : section.items.map((item, index) => {
                      const dupe = dupes.has(nameKey(item.name))
                      const selected = item.id === openId
                      const canDrag = !filtering && item.id !== GLOBAL_SCOPE
                      const moving = dragId === item.id
                      const line = onSection && !drop?.header && drop?.index === index
                      return (
                        <div key={item.id}>
                          {line ? <span className="mb-1 block h-0.5 rounded-full bg-accent" /> : null}
                          <button
                            type="button"
                            draggable={canDrag}
                            className={[
                              'flex w-full items-center rounded border py-1.5 pr-1 pl-2 text-left text-sm',
                              canDrag ? 'cursor-grab active:cursor-grabbing' : '',
                              dupe && selected
                                ? 'border-red bg-red/25 text-ink'
                                : dupe
                                  ? 'border-red bg-red/15 text-ink'
                                  : selected
                                    ? 'border-accent bg-line text-ink'
                                    : 'border-line bg-field text-ink',
                              moving ? 'opacity-20' : '',
                            ].join(' ')}
                            onClick={() => {
                              if (dragged.current) {
                                return
                              }
                              onOpenId(item.id)
                            }}
                            onDragStart={(event) => {
                              if (!canDrag) {
                                event.preventDefault()
                                return
                              }
                              event.dataTransfer.effectAllowed = 'move'
                              event.dataTransfer.setData('text/plain', item.id)
                              dragged.current = true
                              dragRef.current = { id: item.id, title: section.title, index }
                              setDragId(item.id)
                              setDrop({ title: section.title, index })
                            }}
                            onDragEnd={() => {
                              setDragId('')
                              setDrop(null)
                              requestAnimationFrame(() => {
                                dragged.current = false
                              })
                            }}
                            onDragOver={(event) => {
                              if (!dragId || !section.title) {
                                return
                              }
                              event.preventDefault()
                              event.stopPropagation()
                              const rect = event.currentTarget.getBoundingClientRect()
                              hoverDrop(
                                section.title,
                                event.clientY < rect.top + rect.height / 2 ? index : index + 1,
                              )
                            }}
                          >
                            <span className="min-w-0 flex-1 truncate">{item.name}</span>
                            {item.id === GLOBAL_SCOPE ? (
                              <span className="text-[10px] uppercase tracking-wide text-muted">Protected</span>
                            ) : canDrag ? (
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted">
                                <AppIcon id="grip-vertical" size={12} />
                              </span>
                            ) : null}
                          </button>
                        </div>
                      )
                    })}
                {onSection && !closed && !drop?.header && drop?.index === section.items.length && section.items.length > 0 ? (
                  <span className="h-0.5 rounded-full bg-accent" />
                ) : null}
              </div>
            )
          })}
          {shown.length === 0 ? <p className="px-1 text-sm text-muted">No matching scopes.</p> : null}
        </div>
        <PaneSplitter
          value={listWidth}
          onChange={setListWidth}
          onReset={() => setListWidth(LIST_REM * remPx())}
          min={LIST_MIN_REM * remPx()}
          containerRef={rowRef}
        />
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden pl-4">
          {open && open.id !== GLOBAL_SCOPE ? (
            <ScopeEditor
              key={open.id}
              item={open}
              items={items}
              groupOptions={groupOptions}
              onEnsureGroup={ensureGroup}
              onSave={async (patch) => {
                try {
                  await update(open.id, patch)
                } catch (err) {
                  toast(err instanceof Error ? err.message : 'Could not save scope', 'error')
                }
              }}
              onDelete={() => setPending(open.id)}
            />
          ) : null}
          {open?.id === GLOBAL_SCOPE ? <p className="text-sm text-muted">Global cannot be renamed or deleted.</p> : null}
          {!open ? <p className="text-sm text-muted">Select a scope to edit.</p> : null}
        </div>
      </div>
      {pending ? (
        <ConfirmDialog
          title="Delete scope?"
          body="Thumbnails saved only for this scope are removed. Global and other scopes stay."
          onClose={() => setPending('')}
          actions={[
            { label: 'Cancel', onClick: () => setPending('') },
            {
              label: 'Delete',
              kind: 'primary',
              danger: true,
              onClick: () => {
                void remove(pending)
                  .then(() => {
                    if (openId === pending) {
                      onOpenId('')
                    }
                    setPending('')
                  })
                  .catch((err) => toast(err instanceof Error ? err.message : 'Could not delete', 'error'))
              },
            },
          ]}
        />
      ) : null}
    </div>
  )
}
