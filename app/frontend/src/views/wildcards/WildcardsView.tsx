import { useEffect, useRef, useState } from 'react'
import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { IconButton } from '@/components/controls/button/IconButton.tsx'
import { TextField } from '@/components/controls/input/TextField.tsx'
import { WildcardsEditor } from '@/views/wildcards/panels/content/WildcardsEditor.tsx'
import { WildcardOverlays } from '@/views/wildcards/panels/content/sections/WildcardOverlays.tsx'
import { WildcardsSidebar } from '@/views/wildcards/panels/sidebar/WildcardsSidebar.tsx'
import { useWildcardManager } from '@/views/wildcards/panels/sidebar/useWildcardManager.ts'
import { toast } from '@/stores/toastStore.ts'

const TREE_REM = 16

function remPx() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

export function WildcardsView() {
  const rowRef = useRef<HTMLDivElement>(null)
  const [treeWidth, setTreeWidth] = useState(() => TREE_REM * 16)
  const manager = useWildcardManager()
  const {
    roots,
    shown,
    searchOpen,
    openDirs,
    setOpenDirs,
    filePath,
    folderPath,
    draft,
    setDraft,
    dirty,
    pending,
    setPending,
    pendingMove,
    setPendingMove,
    pendingRemove,
    setPendingRemove,
    creating,
    setCreating,
    renaming,
    setRenaming,
    newName,
    setNewName,
    query,
    setQuery,
    busy,
    raw,
    openFile,
    requestFile,
    save,
    create,
    createFolder,
    setLines,
    setTree,
    showRaw,
    showDashboard,
    reveal,
    requestMove,
    moveEntry,
    renameEntry,
    runRemove,
    setFolderPath,
    refreshKind,
    modelsBusy,
  } = manager

  useEffect(() => {
    setTreeWidth(TREE_REM * remPx())
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col px-10 py-4">
      <div className="mb-2 flex h-toolbar shrink-0 items-stretch gap-cluster">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-muted">
            <AppIcon id="search" size={12} />
          </span>
          <TextField
            className="h-full py-0 pl-7"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search…"
          />
        </div>
        <IconButton aria-label="Refresh models"
          title="Refresh models (R)"
          disabled={modelsBusy}
          onClick={() => void refreshKind('wildcards')}
        >
          <AppIcon id="refresh-cw" /></IconButton>
      </div>
      <div ref={rowRef} className="flex min-h-0 flex-1">
        <WildcardsSidebar
          rowRef={rowRef}
          treeWidth={treeWidth}
          shown={shown}
          filePath={filePath}
          folderPath={folderPath}
          openDirs={searchOpen ?? openDirs}
          onToggleDir={(path) => {
            setOpenDirs((current) => {
              const next = new Set(current)
              if (next.has(path)) {
                next.delete(path)
              } else {
                next.add(path)
              }
              return next
            })
          }}
          onSelectFile={requestFile}
          onSelectFolder={setFolderPath}
          onMove={requestMove}
          onRename={(path, name) => setRenaming({ path, name })}
          onReveal={(path) => void reveal(path)}
          onRemove={(path) => setPendingRemove(path)}
          onAdd={(folder) => {
            setCreating(folder)
            setNewName('')
          }}
          onTreeWidth={setTreeWidth}
          onResetTreeWidth={() => setTreeWidth(TREE_REM * remPx())}
        />
        <WildcardsEditor
          draft={draft}
          dirty={dirty}
          raw={raw}
          busy={busy}
          onRaw={() => void showRaw()}
          onDashboard={() => void showDashboard()}
          onReveal={() => void reveal()}
          onRename={() => {
            const path = draft?.path
            if (path) {
              setRenaming({ path, name: path.slice(path.lastIndexOf('/') + 1) })
            }
          }}
          onSave={() => void save()}
          onLines={setLines}
          onTree={setTree}
          onText={(text) => {
            if (draft) {
              setDraft({ ...draft, text, error: undefined })
            }
          }}
        />
      </div>
      <WildcardOverlays
        pending={pending}
        pendingMove={pendingMove}
        pendingRemove={pendingRemove}
        creating={creating}
        newName={newName}
        renaming={renaming}
        roots={roots}
        busy={busy}
        onPendingClose={() => setPending(null)}
        onDiscard={() => {
          const path = pending
          setPending(null)
          if (path) {
            void openFile(path).catch((err) => toast(err instanceof Error ? err.message : 'Could not open file', 'error'))
          }
        }}
        onSaveAndOpen={() => {
          const path = pending
          if (path) {
            void save()
              .then((ok) => {
                if (!ok) {
                  return
                }
                setPending(null)
                return openFile(path)
              })
              .catch((err) => toast(err instanceof Error ? err.message : 'Could not save', 'error'))
          }
        }}
        onMoveClose={() => setPendingMove(null)}
        onMove={() => {
          if (pendingMove) {
            void moveEntry(pendingMove.path, pendingMove.folder)
          }
        }}
        onRemoveClose={() => setPendingRemove(null)}
        onRemove={() => {
          if (pendingRemove) {
            void runRemove(pendingRemove)
          }
        }}
        onCreateName={setNewName}
        onCreateClose={() => setCreating(null)}
        onCreateFile={(ext) => void create(ext)}
        onCreateFolder={() => void createFolder()}
        onRenameName={(name) => {
          if (renaming) {
            setRenaming({ ...renaming, name })
          }
        }}
        onRenameClose={() => setRenaming(null)}
        onRename={() => void renameEntry()}
      />
    </div>
  )
}
