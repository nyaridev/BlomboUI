import { ConfirmDialog } from '@/components/controls/dialog/Dialog.tsx'
import type { WildcardTreeNode } from '@/lib/api.ts'
import { WildcardCreateDialog, WildcardRenameDialog } from '@/views/wildcards/panels/content/sections/WildcardDialogs.tsx'

type MoveState = { path: string; folder: string; from: string; to: string }
type RenameState = { path: string; name: string }

function siblingNames(nodes: WildcardTreeNode[], folder: string): string[] | null {
  for (const node of nodes) {
    if (node.kind !== 'dir') {
      continue
    }
    if (node.path === folder) {
      return (node.children || []).map((child) => child.name)
    }
    const inner = siblingNames(node.children || [], folder)
    if (inner) {
      return inner
    }
  }
  return null
}

export function WildcardOverlays({
  pending,
  pendingMove,
  pendingRemove,
  creating,
  newName,
  renaming,
  roots,
  busy,
  onPendingClose,
  onDiscard,
  onSaveAndOpen,
  onMoveClose,
  onMove,
  onRemoveClose,
  onRemove,
  onCreateName,
  onCreateClose,
  onCreateFile,
  onCreateFolder,
  onRenameName,
  onRenameClose,
  onRename,
}: {
  pending: string | null
  pendingMove: MoveState | null
  pendingRemove: string | null
  creating: string | null
  newName: string
  renaming: RenameState | null
  roots: WildcardTreeNode[]
  busy: boolean
  onPendingClose: () => void
  onDiscard: () => void
  onSaveAndOpen: () => void
  onMoveClose: () => void
  onMove: () => void
  onRemoveClose: () => void
  onRemove: () => void
  onCreateName: (name: string) => void
  onCreateClose: () => void
  onCreateFile: (ext: '.txt' | '.yaml') => void
  onCreateFolder: () => void
  onRenameName: (name: string) => void
  onRenameClose: () => void
  onRename: () => void
}) {
  return (
    <>
      {pending ? (
        <ConfirmDialog
          title="Unsaved changes"
          body="Save this file before opening another?"
          onClose={onPendingClose}
          actions={[
            { label: 'Cancel', onClick: onPendingClose },
            { label: 'Discard', onClick: onDiscard },
            { label: 'Save', kind: 'primary', onClick: onSaveAndOpen },
          ]}
        />
      ) : null}
      {pendingMove ? (
        <ConfirmDialog
          title="Move to another directory?"
          body={`This moves the item from ${pendingMove.from} to ${pendingMove.to}.`}
          onClose={onMoveClose}
          actions={[
            { label: 'Cancel', onClick: onMoveClose },
            { label: 'Move', kind: 'primary', onClick: onMove },
          ]}
        />
      ) : null}
      {pendingRemove ? (
        <ConfirmDialog
          title="Move to Trash?"
          body="This can be restored from Settings → Trash."
          onClose={onRemoveClose}
          actions={[
            { label: 'Cancel', onClick: onRemoveClose },
            { label: 'Remove', kind: 'primary', danger: true, onClick: onRemove },
          ]}
        />
      ) : null}
      {creating !== null ? (
        <WildcardCreateDialog
          folder={creating}
          name={newName}
          taken={siblingNames(roots, creating) ?? []}
          busy={busy}
          onName={onCreateName}
          onClose={onCreateClose}
          onCreateFile={onCreateFile}
          onCreateFolder={onCreateFolder}
        />
      ) : null}
      {renaming ? (
        <WildcardRenameDialog
          name={renaming.name}
          taken={siblingNames(roots, renaming.path.slice(0, renaming.path.lastIndexOf('/'))) ?? []}
          busy={busy}
          onName={onRenameName}
          onClose={onRenameClose}
          onRename={onRename}
        />
      ) : null}
    </>
  )
}
