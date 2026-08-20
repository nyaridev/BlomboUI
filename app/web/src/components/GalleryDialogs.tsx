import { useLayoutEffect, useRef } from 'react'
import { Dialog } from '@/components/Dialog.tsx'

const INPUT =
  'mt-2 w-full rounded border bg-field px-2 py-1.5 text-sm text-ink outline-none placeholder:text-muted'
const GHOST =
  'rounded px-2.5 py-1 text-xs text-muted hover:bg-line hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted'
const PRIMARY = 'rounded bg-accent px-2.5 py-1 text-xs text-ink disabled:opacity-40'
const NAME_OK = /^[A-Za-z0-9._ -]+$/

function uniqueError(name: string, taken: string[], ignore = '') {
  const want = name.trim().toLowerCase()
  if (!want) {
    return null
  }
  const skip = ignore.trim().toLowerCase()
  const hit = taken.find((item) => {
    const other = item.trim().toLowerCase()
    return Boolean(other) && other === want && other !== skip
  })
  if (!hit) {
    return null
  }
  return `${hit} already exists`
}

function nameError(name: string, taken: string[], ignore = '') {
  const trimmed = name.trim()
  if (!trimmed) {
    return null
  }
  if (!NAME_OK.test(trimmed)) {
    return 'Use letters, numbers, spaces, dots, underscores, or dashes'
  }
  return uniqueError(trimmed, taken, ignore)
}

export function GalleryCreateFolderDialog({
  folder,
  name,
  taken,
  busy,
  onName,
  onClose,
  onCreate,
}: {
  folder: string
  name: string
  taken: string[]
  busy: boolean
  onName: (name: string) => void
  onClose: () => void
  onCreate: () => void
}) {
  const issue = nameError(name, taken)
  const canSave = Boolean(name.trim()) && !issue && !busy
  return (
    <Dialog onClose={onClose}>
      <p className="text-sm text-ink">New folder</p>
      <p className="mt-1.5 text-xs text-muted">Created in {folder || 'Local'}.</p>
      <input
        className={[INPUT, issue ? 'border-red focus:border-red' : 'border-line focus:border-accent'].join(' ')}
        value={name}
        onChange={(event) => onName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            if (canSave) {
              onCreate()
            }
          }
        }}
        placeholder="name"
        autoFocus
      />
      {issue ? <p className="mt-1.5 text-xs text-red">{issue}</p> : null}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className={GHOST} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={PRIMARY} disabled={!canSave} onClick={onCreate}>
          Create
        </button>
      </div>
    </Dialog>
  )
}

export function GalleryRenameDialog({
  name,
  taken,
  busy,
  onName,
  onClose,
  onRename,
}: {
  name: string
  taken: string[]
  busy: boolean
  onName: (name: string) => void
  onClose: () => void
  onRename: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const original = useRef(name).current
  const issue = nameError(name, taken, original)
  const canSave = Boolean(name.trim()) && !issue && !busy && name.trim() !== original

  useLayoutEffect(() => {
    const el = input.current
    if (!el) {
      return
    }
    el.focus()
    const cut = el.value.lastIndexOf('.')
    if (cut > 0) {
      el.setSelectionRange(0, cut)
    } else {
      el.select()
    }
  }, [])

  return (
    <Dialog onClose={onClose}>
      <p className="text-sm text-ink">Rename</p>
      <input
        ref={input}
        className={[INPUT, issue ? 'border-red focus:border-red' : 'border-line focus:border-accent'].join(' ')}
        value={name}
        onChange={(event) => onName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            if (canSave) {
              onRename()
            }
          }
        }}
        placeholder="name"
      />
      {issue ? <p className="mt-1.5 text-xs text-red">{issue}</p> : null}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className={GHOST} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={PRIMARY} disabled={!canSave} onClick={onRename}>
          Rename
        </button>
      </div>
    </Dialog>
  )
}
