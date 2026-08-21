import { ChipInput } from '@/components/ChipInput.tsx'
import { NumberField } from '@/components/NumberField.tsx'
import { SelectField } from '@/components/SelectField.tsx'
import { type ThumbScope } from '@/lib/api.ts'
import { useEffect, useMemo, useRef, useState } from 'react'

function sameTags(a: string[], b: string[]) {
  return a.length === b.length && a.every((item, index) => item === b[index])
}

function sameGroups(a: string[][], b: string[][]) {
  return a.length === b.length && a.every((row, index) => sameTags(row, b[index]))
}

export function ScopeEditor({
  item,
  items,
  groupOptions,
  onSave,
  onDelete,
  onEnsureGroup,
}: {
  item: ThumbScope
  items: ThumbScope[]
  groupOptions: { value: string; label: string }[]
  onSave: (patch: Omit<ThumbScope, 'id'>) => Promise<void>
  onDelete: () => void
  onEnsureGroup: (name: string) => void
}) {
  const [name, setName] = useState(item.name)
  const [group, setGroup] = useState(item.group)
  const [anyGroups, setAnyGroups] = useState(item.anyGroups)
  const [exclude, setExclude] = useState(item.exclude)
  const [priority, setPriority] = useState(item.priority)
  const [saving, setSaving] = useState(false)
  const form = useRef({ name, group, anyGroups, exclude, priority })
  form.current = { name, group, anyGroups, exclude, priority }

  useEffect(() => {
    setName(item.name)
    setGroup(item.group)
    setAnyGroups(item.anyGroups)
    setExclude(item.exclude)
    setPriority(item.priority)
  }, [item])

  const dirty =
    name !== item.name ||
    group !== item.group ||
    priority !== item.priority ||
    !sameGroups(anyGroups, item.anyGroups) ||
    !sameTags(exclude, item.exclude)
  const clash = items.some(
    (other) => other.id !== item.id && other.name.trim().toLowerCase() === name.trim().toLowerCase() && name.trim(),
  )
  const canSave = dirty && Boolean(name.trim()) && !saving

  const options = useMemo(() => {
    if (!group || groupOptions.some((row) => row.value === group)) {
      return groupOptions
    }
    return [...groupOptions, { value: group, label: group }]
  }, [group, groupOptions])

  function revert() {
    setName(item.name)
    setGroup(item.group)
    setAnyGroups(item.anyGroups)
    setExclude(item.exclude)
    setPriority(item.priority)
  }

  async function save() {
    const row = form.current
    const nextName = row.name.trim()
    if (!nextName || saving) {
      return
    }
    setSaving(true)
    try {
      if (row.group.trim()) {
        onEnsureGroup(row.group.trim())
      }
      await onSave({
        name: nextName,
        group: row.group,
        anyGroups: row.anyGroups,
        exclude: row.exclude,
        priority: row.priority,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-ink">{name.trim() || 'Untitled scope'}</p>
          <p className={['text-xs', dirty ? 'text-ink' : 'text-muted'].join(' ')}>
            {dirty ? 'Unsaved changes' : 'All changes saved'}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          {dirty ? (
            <button type="button" className="rounded border border-line px-2 py-1.5 text-xs text-ink" onClick={revert}>
              Revert
            </button>
          ) : null}
          <button
            type="button"
            className="rounded bg-accent px-2 py-1.5 text-xs text-ink disabled:opacity-40"
            disabled={!canSave}
            onClick={() => void save()}
          >
            {dirty ? 'Save' : 'Saved'}
          </button>
          <button type="button" className="rounded border border-line px-2 py-1.5 text-xs text-ink" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
        <section className="flex flex-col gap-3 rounded-md border border-line bg-panel p-3">
          <h2 className="text-xs tracking-[0.12em] text-muted uppercase">Identity</h2>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Name
            <input
              className={[
                'h-8 rounded border bg-field px-2 text-sm text-ink outline-none focus:border-accent',
                clash ? 'border-red' : 'border-line',
              ].join(' ')}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            {clash ? <span className="text-red">This name is already used by another scope.</span> : null}
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Group
            <SelectField
              value={group}
              allowCustom
              placeholder="Ungrouped"
              options={options}
              onChange={(value) => {
                form.current.group = value
                setGroup(value)
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Priority
            <NumberField value={priority} onChange={setPriority} min={-1000} max={1000} />
            <span>Higher values win when more than one scope matches.</span>
          </label>
        </section>
        <section className="flex flex-col gap-3 rounded-md border border-line bg-panel p-3">
          <h2 className="text-xs tracking-[0.12em] text-muted uppercase">Matching</h2>
          <div className="flex flex-col gap-1 text-xs text-muted">
            Tag groups
            <p>Tags in a row are alternatives. Every row must match.</p>
            {anyGroups.map((row, index) => (
              <div key={index} className="flex gap-1">
                <ChipInput
                  value={row}
                  onChange={(value) => setAnyGroups(anyGroups.map((item, i) => (i === index ? value : item)))}
                  placeholder="fern, fern (sousou no frieren)"
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
              Add tag group
            </button>
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Exclude tags
            <ChipInput value={exclude} onChange={setExclude} placeholder="Never match…" />
            <span>Skip this scope when any of these tags are in the prompt.</span>
          </label>
        </section>
      </div>
    </div>
  )
}
