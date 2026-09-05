import { useRef } from 'react'
import { NameDialog } from '@/components/controls/dialog/NameDialog.tsx'
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
  const original = useRef(name).current
  const issue = nameError(name, taken, original)
  const canSave = Boolean(name.trim()) && !issue && !busy && name.trim() !== original

  return (
    <NameDialog
      title="Rename"
      name={name}
      issue={issue}
      busy={busy}
      onName={onName}
      onClose={onClose}
      selectBeforeExtension
      actions={[
        { label: 'Cancel', onClick: onClose },
        { label: 'Rename', kind: 'primary', disabled: !canSave, submit: true, onClick: onRename },
      ]}
    />
  )
}
