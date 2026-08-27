import { useRef } from 'react'
import { NameDialog } from '@/components/controls/dialog/NameDialog.tsx'
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
    <NameDialog
      title="New"
      description={<p className="mt-1.5 text-xs text-muted">Created in {folder || 'Local'}.</p>}
      name={name}
      issue={clash}
      busy={busy}
      onName={onName}
      onClose={onClose}
      actions={[
        { label: 'Cancel', onClick: onClose },
        { label: 'Folder', disabled: !filled || blocked, onClick: onCreateFolder },
        { label: '.txt', disabled: !filled || blocked, onClick: () => onCreateFile('.txt') },
        { label: '.yaml', kind: 'primary', disabled: !filled || blocked, onClick: () => onCreateFile('.yaml') },
      ]}
    />
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
  const original = useRef(name).current
  const issue = renameError(name, original, taken)
  const canSave = Boolean(name.trim()) && !issue && !busy

  return (
    <NameDialog
      title="Rename"
      name={name}
      issue={issue}
      busy={busy}
      onName={onName}
      onClose={onClose}
      selectBeforeExtension={FILE_EXT.test(original)}
      selectAllOnOpen={!FILE_EXT.test(original)}
      actions={[
        { label: 'Cancel', onClick: onClose },
        { label: 'Rename', kind: 'primary', disabled: !canSave, submit: true, onClick: onRename },
      ]}
    />
  )
}
