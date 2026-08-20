import { useLayoutEffect, useRef } from 'react'
import { Dialog } from '@/components/Dialog.tsx'

const INPUT =
  'mt-2 w-full rounded border bg-field px-2 py-1.5 text-sm text-ink outline-none placeholder:text-muted'
const GHOST = 'rounded px-2.5 py-1 text-xs text-muted hover:bg-line hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted'
const PRIMARY = 'rounded bg-accent px-2.5 py-1 text-xs text-ink disabled:opacity-40'
const FILE_EXT = /\.(txt|ya?ml)$/i
const OK_EXT = new Set(['.txt', '.yaml', '.yml'])

function fileExt(name: string) {
  const cut = name.trim().lastIndexOf('.')
  if (cut <= 0) {
    return ''
  }
  return name.trim().slice(cut).toLowerCase()
}

function nameStem(name: string) {
  return name.trim().replace(/\.(txt|ya?ml)$/i, '').toLowerCase()
}

function uniqueError(name: string, taken: string[], ignore = '') {
  const stem = nameStem(name)
  if (!stem) {
    return null
  }
  const skip = nameStem(ignore)
  const hit = taken.find((item) => {
    const other = nameStem(item)
    return Boolean(other) && other === stem && other !== skip
  })
  if (!hit) {
    return null
  }
  return `${hit} already exists. Folder, .txt, and .yaml names must be unique.`
}

function renameError(name: string, original: string, taken: string[]) {
  if (FILE_EXT.test(original)) {
    const ext = fileExt(name)
    if (!ext) {
      return 'Add a .txt, .yaml, or .yml extension'
    }
    if (!OK_EXT.has(ext)) {
      return `Use .txt, .yaml, or .yml, not ${ext}`
    }
  }
  return uniqueError(name, taken, original)
}

export function WildcardCreateDialog({
  folder,
  name,
  taken,
  busy,
  onName,
  onClose,
  onCreateFile,
  onCreateFolder,
}: {
  folder: string
  name: string
  taken: string[]
  busy: boolean
  onName: (name: string) => void
  onClose: () => void
  onCreateFile: (ext: '.txt' | '.yaml') => void
  onCreateFolder: () => void
}) {
  const clash = uniqueError(name, taken)
  const filled = Boolean(name.trim()) && !busy
  const blocked = Boolean(clash)
  return (
    <Dialog onClose={onClose}>
      <p className="text-sm text-ink">New</p>
      <p className="mt-1.5 text-xs text-muted">Created in {folder || 'Local'}.</p>
      <input
        className={[INPUT, clash ? 'border-red focus:border-red' : 'border-line focus:border-accent'].join(' ')}
        value={name}
        onChange={(event) => onName(event.target.value)}
        placeholder="name"
        autoFocus
      />
      {clash ? <p className="mt-1.5 text-xs text-red">{clash}</p> : null}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className={GHOST} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={GHOST} disabled={!filled || blocked} onClick={onCreateFolder}>
          Folder
        </button>
        <button type="button" className={GHOST} disabled={!filled || blocked} onClick={() => onCreateFile('.txt')}>
          .txt
        </button>
        <button type="button" className={PRIMARY} disabled={!filled || blocked} onClick={() => onCreateFile('.yaml')}>
          .yaml
        </button>
      </div>
    </Dialog>
  )
}

export function WildcardRenameDialog({
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
  const issue = renameError(name, original, taken)
  const canSave = Boolean(name.trim()) && !issue && !busy

  useLayoutEffect(() => {
    const el = input.current
    if (!el) {
      return
    }
    el.focus()
    const cut = el.value.lastIndexOf('.')
    if (cut > 0 && FILE_EXT.test(el.value.slice(cut))) {
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
