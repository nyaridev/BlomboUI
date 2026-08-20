import { ChipInput } from '@/components/ChipInput.tsx'
import { ConfirmDialog } from '@/components/Dialog.tsx'
import { NumberField } from '@/components/NumberField.tsx'
import { PaneSplitter } from '@/components/PaneSplitter.tsx'
import { GLOBAL_SCOPE } from '@/lib/thumbView.ts'
import { type ThumbScope } from '@/lib/api.ts'
import { useGenerateStore } from '@/stores/generateStore.ts'
import { useThumbnailScopeStore } from '@/stores/thumbnailScopeStore.ts'
import { toast } from '@/stores/toastStore.ts'
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

export function ScopesScreen() {
  const items = useThumbnailScopeStore((s) => s.items)
  const loaded = useThumbnailScopeStore((s) => s.loaded)
  const load = useThumbnailScopeStore((s) => s.load)
  const create = useThumbnailScopeStore((s) => s.create)
  const update = useThumbnailScopeStore((s) => s.update)
  const remove = useThumbnailScopeStore((s) => s.remove)
  const prompt = useGenerateStore((s) => s.prompt)
  const rowRef = useRef<HTMLDivElement>(null)
  const [listWidth, setListWidth] = useState(() => LIST_REM * 16)
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState('')
  const [pending, setPending] = useState('')
  const [draftName, setDraftName] = useState('')
  const [creating, setCreating] = useState(false)

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
      return [item.name, item.group, ...item.required, ...item.optional].join(' ').toLowerCase().includes(needle)
    })
  }, [items, search])
  const open = items.find((item) => item.id === openId)

  async function add(required: string[] = []) {
    const name = draftName.trim() || required[0] || ''
    if (!name) {
      toast('Name is required', 'error')
      return
    }
    setCreating(true)
    try {
      const row = await create({ name, required })
      setDraftName('')
      setOpenId(row.id)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not create scope', 'error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col px-10 py-4">
      <div className="mb-2 flex h-8 shrink-0 items-stretch gap-1">
        <input
          className="h-full min-w-0 flex-1 rounded border border-line bg-field px-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search scopes…"
        />
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
        <div className="flex min-h-0 shrink-0 flex-col gap-1 overflow-y-auto pr-1" style={{ width: listWidth }}>
          {shown.map((item) => (
            <button
              key={item.id}
              type="button"
              className={[
                'flex items-center justify-between rounded border px-2 py-1.5 text-left text-sm',
                item.id === openId ? 'border-accent bg-line text-ink' : 'border-line bg-field text-ink',
              ].join(' ')}
              onClick={() => setOpenId(item.id)}
            >
              <span className="min-w-0 truncate">
                {item.name}
                {item.group ? <span className="ml-2 text-xs text-muted">{item.group}</span> : null}
              </span>
              {item.id === GLOBAL_SCOPE ? (
                <span className="text-[10px] uppercase tracking-wide text-muted">Protected</span>
              ) : null}
            </button>
          ))}
          {shown.length === 0 ? <p className="px-1 text-sm text-muted">No matching scopes.</p> : null}
        </div>
        <PaneSplitter
          value={listWidth}
          onChange={setListWidth}
          onReset={() => setListWidth(LIST_REM * remPx())}
          min={LIST_MIN_REM * remPx()}
          containerRef={rowRef}
        />
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto pl-4">
          {open && open.id !== GLOBAL_SCOPE ? (
            <ScopeEditor
              key={open.id}
              item={open}
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
                      setOpenId('')
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

function ScopeEditor({
  item,
  onSave,
  onDelete,
}: {
  item: ThumbScope
  onSave: (patch: Omit<ThumbScope, 'id'>) => Promise<void>
  onDelete: () => void
}) {
  const [name, setName] = useState(item.name)
  const [group, setGroup] = useState(item.group)
  const [required, setRequired] = useState(item.required)
  const [optional, setOptional] = useState(item.optional)
  const [anyGroups, setAnyGroups] = useState(item.anyGroups)
  const [exclude, setExclude] = useState(item.exclude)
  const [priority, setPriority] = useState(item.priority)

  useEffect(() => {
    setName(item.name)
    setGroup(item.group)
    setRequired(item.required)
    setOptional(item.optional)
    setAnyGroups(item.anyGroups)
    setExclude(item.exclude)
    setPriority(item.priority)
  }, [item])

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Name
        <input
          className="h-8 rounded border border-line bg-field px-2 text-sm text-ink outline-none focus:border-accent"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Group
        <input
          className="h-8 rounded border border-line bg-field px-2 text-sm text-ink outline-none focus:border-accent"
          value={group}
          onChange={(event) => setGroup(event.target.value)}
          placeholder="Character, Clothing…"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Required tags
        <ChipInput value={required} onChange={setRequired} placeholder="All of these…" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Optional tags
        <ChipInput value={optional} onChange={setOptional} placeholder="Improve Most Likely…" />
      </label>
      <div className="flex flex-col gap-1 text-xs text-muted">
        Any-of groups
        {anyGroups.map((row, index) => (
          <div key={index} className="flex gap-1">
            <ChipInput
              value={row}
              onChange={(value) => setAnyGroups(anyGroups.map((item, i) => (i === index ? value : item)))}
              placeholder="on knees, kneeling"
            />
            <button
              type="button"
              className="rounded border border-line px-2 text-ink"
              onClick={() => setAnyGroups(anyGroups.filter((_, i) => i !== index))}
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="self-start text-xs text-ink" onClick={() => setAnyGroups([...anyGroups, []])}>
          Add alias group
        </button>
      </div>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Exclude tags
        <ChipInput value={exclude} onChange={setExclude} placeholder="Never match…" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Priority
        <NumberField value={priority} onChange={setPriority} min={-1000} max={1000} />
      </label>
      <div className="flex gap-1">
        <button
          type="button"
          className="rounded bg-accent px-2 py-1.5 text-xs text-ink"
          onClick={() => void onSave({ name, group, required, optional, anyGroups, exclude, priority })}
        >
          Save
        </button>
        <button type="button" className="rounded border border-line px-2 py-1.5 text-xs text-ink" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  )
}
