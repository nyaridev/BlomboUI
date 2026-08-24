import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { FolderField } from '@/components/primitives/FolderField.tsx'
import { checkFolderPaths } from '@/lib/api.ts'
import { Fragment, useEffect, useMemo, useState } from 'react'

export const LOCAL_ID = 'local'
export const OUTPUT_ID = 'output'

export type FolderEntry = {
  id: string
  name: string
  path: string
}

function nextName(prefix: string, items: FolderEntry[]) {
  const used = new Set(items.map((item) => item.name))
  for (let i = 1; i < 1000; i++) {
    const name = `${prefix}_${String(i).padStart(3, '0')}`
    if (!used.has(name)) {
      return name
    }
  }
  return `${prefix}_${Date.now()}`
}

export function folderProblems(
  items: FolderEntry[],
  exists: Record<string, boolean>,
  liveIds: Set<string>,
): Map<string, 'duplicate' | 'missing'> {
  const out = new Map<string, 'duplicate' | 'missing'>()
  const seenNames = new Map<string, string>()
  const seenPaths = new Map<string, string>()
  for (const item of items) {
    if (liveIds.has(item.id)) {
      const folder = normDir(item.path)
      if (folder) {
        seenPaths.set(folder, item.id)
      }
    }
  }
  for (const item of items) {
    const key = item.name.trim().toLowerCase()
    if (key) {
      const first = seenNames.get(key)
      if (first && first !== item.id) {
        out.set(item.id, 'duplicate')
      } else if (!first) {
        seenNames.set(key, item.id)
      }
    }
    const folder = normDir(item.path)
    if (folder && !liveIds.has(item.id)) {
      const first = seenPaths.get(folder)
      if (first && first !== item.id) {
        out.set(item.id, 'duplicate')
      } else if (!first) {
        seenPaths.set(folder, item.id)
      }
    }
    if (out.get(item.id) === 'duplicate' || liveIds.has(item.id)) {
      continue
    }
    const path = item.path.trim()
    if (!path || exists[path] === false) {
      out.set(item.id, 'missing')
    }
  }
  return out
}

function normDir(raw: string) {
  return raw.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

export function FolderList({
  items,
  onChange,
  prefix,
  lockedId,
  livePaths = {},
  pinLocked = false,
}: {
  items: FolderEntry[]
  onChange: (items: FolderEntry[]) => void
  prefix: string
  lockedId: string
  livePaths?: Record<string, string>
  pinLocked?: boolean
}) {
  const [drag, setDrag] = useState<number | null>(null)
  const [slot, setSlot] = useState<number | null>(null)
  const [exists, setExists] = useState<Record<string, boolean>>({})
  const liveIds = useMemo(() => new Set(Object.keys(livePaths)), [livePaths])
  const extras = items.filter((item) => item.id !== lockedId)
  const locked = items.find((item) => item.id === lockedId)
  const rows = pinLocked ? extras : items
  const problems = folderProblems(
    items.map((item) => ({ ...item, path: livePaths[item.id] || item.path })),
    exists,
    liveIds,
  )

  const extraPaths = extras.map((item) => item.path).join('\n')

  useEffect(() => {
    const paths = extraPaths.split('\n').map((item) => item.trim()).filter(Boolean)
    if (!paths.length) {
      setExists({})
      return
    }
    const timer = window.setTimeout(() => {
      void checkFolderPaths(paths)
        .then(setExists)
        .catch(() => {})
    }, 250)
    return () => window.clearTimeout(timer)
  }, [extraPaths])

  function moving() {
    return drag !== null && slot !== null && slot !== drag && slot !== drag + 1
  }

  function applyDrop() {
    if (!moving() || drag === null || slot === null) {
      return
    }
    const nextRows = [...rows]
    const [item] = nextRows.splice(drag, 1)
    nextRows.splice(drag < slot ? slot - 1 : slot, 0, item)
    onChange(pinLocked && locked ? [locked, ...nextRows] : nextRows)
  }

  function patch(id: string, part: Partial<FolderEntry>) {
    onChange(items.map((item) => (item.id === id ? { ...item, ...part } : item)))
  }

  function rowClass(item: FolderEntry, index: number) {
    const problem = problems.get(item.id)
    return [
      'flex items-center gap-1.5 rounded-md border p-1.5',
      problem ? 'border-red/70 bg-red/15' : 'border-line bg-panel',
      drag === index ? 'opacity-20' : '',
    ].join(' ')
  }

  function renderRow(item: FolderEntry, index: number, draggable: boolean) {
    const lockedRow = item.id === lockedId
    const path = livePaths[item.id] || item.path
    return (
      <div
        className={rowClass(item, index)}
        onDragOver={(event) => {
          if (!draggable) {
            return
          }
          event.preventDefault()
          event.stopPropagation()
          if (drag === null) {
            return
          }
          setSlot(index === drag ? drag : index < drag ? index : index + 1)
        }}
        onDrop={(event) => {
          event.preventDefault()
          event.stopPropagation()
          applyDrop()
        }}
      >
        {draggable ? (
          <span
            draggable
            className="flex h-8 w-5 shrink-0 cursor-grab items-center justify-center text-muted active:cursor-grabbing"
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', item.id)
              setDrag(index)
              setSlot(index)
            }}
            onDragEnd={() => {
              setDrag(null)
              setSlot(null)
            }}
          >
            <AppIcon id="grip-vertical" size={12} />
          </span>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <input
          className={[
            'box-border h-8 w-28 shrink-0 rounded border border-line bg-field px-2 py-0 text-sm leading-[1.875rem] text-ink outline-none focus:border-accent',
            lockedRow ? 'opacity-70' : '',
          ].join(' ')}
          value={item.name}
          readOnly={lockedRow}
          onChange={lockedRow ? undefined : (event) => patch(item.id, { name: event.target.value })}
        />
        <FolderField
          value={path}
          readOnly={lockedRow}
          onChange={lockedRow ? undefined : (next) => patch(item.id, { path: next })}
          placeholder="Folder path"
        />
        {lockedRow ? null : (
          <button
            type="button"
            className="icon-btn shrink-0"
            aria-label={`Remove ${item.name}`}
            onClick={() => onChange(items.filter((row) => row.id !== item.id))}
          >
            <AppIcon id="x" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      {pinLocked && locked ? renderRow(locked, -1, false) : null}
      <div
        className="flex flex-col gap-1.5"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          applyDrop()
        }}
      >
        {rows.map((item, index) => (
          <Fragment key={item.id}>
            {moving() && slot === index ? <span className="h-0.5 rounded-full bg-accent" /> : null}
            {renderRow(item, index, true)}
          </Fragment>
        ))}
        {moving() && slot === rows.length ? <span className="h-0.5 rounded-full bg-accent" /> : null}
        <button
          type="button"
          className="flex w-full items-center justify-center rounded-md border border-line bg-panel p-1.5 text-muted hover:bg-field hover:text-ink"
          aria-label="Add folder"
          onClick={() =>
            onChange([...items, { id: crypto.randomUUID(), name: nextName(prefix, items), path: '' }])
          }
        >
          <AppIcon id="plus" />
        </button>
      </div>
    </div>
  )
}
