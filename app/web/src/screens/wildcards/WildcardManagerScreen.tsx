import { useEffect, useRef, useState } from 'react'
import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { WildcardEditorPane } from './WildcardEditorPane.tsx'
import { WildcardOverlays } from './WildcardOverlays.tsx'
import { WildcardTreePane } from './WildcardTreePane.tsx'
import { useWildcardManager } from './useWildcardManager.ts'
import { toast } from '@/stores/toastStore.ts'

const TREE_REM = 16

function remPx() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

export function WildcardManagerScreen() {
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
      <div className="mb-2 flex h-8 shrink-0 items-stretch gap-1">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-muted">
            <AppIcon id="search" size={12} />
          </span>
          <input
            className="h-full w-full rounded border border-line bg-field py-0 pr-2 pl-7 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search…"
          />
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Refresh models"
          title="Refresh models (R)"
          disabled={modelsBusy}
          onClick={() => void refreshKind('wildcards')}
        >
          <AppIcon id="refresh-cw" />
        </button>
      </div>
      <div ref={rowRef} className="flex min-h-0 flex-1">
        <WildcardTreePane
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
        <WildcardEditorPane
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
