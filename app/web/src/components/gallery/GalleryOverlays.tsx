import { ConfirmDialog } from '@/components/primitives/Dialog.tsx'
import { ContextMenu, ContextMenuItem } from '@/components/chrome/ContextMenu.tsx'
import { GalleryCreateFolderDialog, GalleryRenameDialog } from '@/components/gallery/GalleryDialogs.tsx'
import { ModelInfoDialog } from '@/components/models/ModelInfoDialog.tsx'
import { identToDisplay, parentIdent, siblingNames, type GalleryNode } from '@/lib/gallery/tree.ts'
import type { CivitaiVersion, ModelEntry, ModelLists } from '@/lib/api.ts'

type NameState = { folder: string; name: string }
type RenameState = { path: string; name: string }
type MoveState = { path: string; folder: string; from: string; to: string }
type TileMenuState = { x: number; y: number; path: string; name: string; fileTile: boolean }
type FillConfirm = { path: string; hit: CivitaiVersion; kind: keyof ModelLists }

export function GalleryOverlays({
  kind,
  scopeKey,
  extraNames,
  tree,
  kindOf,
  infoItem,
  onInfoClose,
  onInfoSaved,
  fillConfirm,
  onFillClose,
  onFill,
  creating,
  renaming,
  fileBusy,
  onCreateName,
  onCreateClose,
  onCreate,
  onRenameName,
  onRenameClose,
  onRename,
  pendingMove,
  onMoveClose,
  onMove,
  pendingRemove,
  onRemoveClose,
  onRemove,
  tileMenu,
  onTileClose,
  onTileRename,
  onTileReveal,
  onTileOpenManager,
  onTileRemove,
}: {
  kind: keyof ModelLists
  scopeKey: string
  extraNames: string[]
  tree: GalleryNode[]
  kindOf: (item: ModelEntry) => keyof ModelLists
  infoItem: ModelEntry | null
  onInfoClose: () => void
  onInfoSaved: (thumb: number) => void
  fillConfirm: FillConfirm | null
  onFillClose: () => void
  onFill: () => void
  creating: NameState | null
  renaming: RenameState | null
  fileBusy: boolean
  onCreateName: (name: string) => void
  onCreateClose: () => void
  onCreate: () => void
  onRenameName: (name: string) => void
  onRenameClose: () => void
  onRename: () => void
  pendingMove: MoveState | null
  onMoveClose: () => void
  onMove: () => void
  pendingRemove: string | null
  onRemoveClose: () => void
  onRemove: () => void
  tileMenu: TileMenuState | null
  onTileClose: () => void
  onTileRename: (path: string, name: string) => void
  onTileReveal: (path: string) => void
  onTileOpenManager: (path: string) => void
  onTileRemove: (path: string) => void
}) {
  return (
    <>
      {infoItem ? (
        <ModelInfoDialog
          kind={kindOf(infoItem)}
          item={infoItem}
          scopeKey={scopeKey}
          onClose={onInfoClose}
          onSaved={onInfoSaved}
        />
      ) : null}
      {fillConfirm ? (
        <ConfirmDialog
          title="Replace existing data?"
          body={
            fillConfirm.kind === 'loras'
              ? 'Thumbnail, model type, or trigger words are already set. Download from Civitai anyway?'
              : 'Thumbnail or model type is already set. Download from Civitai anyway?'
          }
          onClose={onFillClose}
          actions={[
            { label: 'Cancel', onClick: onFillClose },
            { label: 'Replace', kind: 'primary', onClick: onFill },
          ]}
        />
      ) : null}
      {creating ? (
        <GalleryCreateFolderDialog
          folder={identToDisplay(creating.folder, extraNames)}
          name={creating.name}
          taken={siblingNames(tree, identToDisplay(creating.folder, extraNames)) ?? []}
          busy={fileBusy}
          onName={onCreateName}
          onClose={onCreateClose}
          onCreate={onCreate}
        />
      ) : null}
      {renaming ? (
        <GalleryRenameDialog
          name={renaming.name}
          taken={siblingNames(tree, identToDisplay(parentIdent(renaming.path), extraNames)) ?? []}
          busy={fileBusy}
          onName={onRenameName}
          onClose={onRenameClose}
          onRename={onRename}
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
      {tileMenu ? (
        <ContextMenu x={tileMenu.x} y={tileMenu.y} onClose={onTileClose}>
          {tileMenu.fileTile ? (
            <ContextMenuItem label="Rename" onClick={() => onTileRename(tileMenu.path, tileMenu.name)} />
          ) : null}
          <ContextMenuItem label="Show in Explorer" onClick={() => onTileReveal(tileMenu.path)} />
          {kind === 'wildcards' ? (
            <ContextMenuItem icon="file-pen" label="Open in Wildcard Manager" onClick={() => onTileOpenManager(tileMenu.path)} />
          ) : null}
          {tileMenu.fileTile ? <ContextMenuItem label="Remove" danger onClick={() => onTileRemove(tileMenu.path)} /> : null}
        </ContextMenu>
      ) : null}
    </>
  )
}
