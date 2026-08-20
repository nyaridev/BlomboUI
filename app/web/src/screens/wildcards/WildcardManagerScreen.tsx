import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AppIcon } from '@/components/AppIcon.tsx'
import { ConfirmDialog } from '@/components/Dialog.tsx'
import { PaneSplitter } from '@/components/PaneSplitter.tsx'
import {
  createWildcardFile,
  createWildcardFolder,
  formatWildcardYaml,
  getWildcardFile,
  getWildcardTree,
  moveWildcardEntry,
  renameWildcardEntry,
  revealWildcardFile,
  saveWildcardFile,
  removeEntry as trashEntry,
  type WildcardFile,
  type WildcardTreeNode,
  type YamlNode,
} from '@/lib/api.ts'
import { scopeRoot } from '@/lib/galleryTree.ts'
import { useModelsStore } from '@/stores/modelsStore.ts'
import { toast } from '@/stores/toastStore.ts'
import { LineList } from './LineList.tsx'
import { RawEditor } from './RawEditor.tsx'
import { WildcardCreateDialog, WildcardRenameDialog } from './WildcardDialogs.tsx'
import { WildcardFileBar } from './WildcardFileBar.tsx'
import { filterWildcardTree, WildcardTree } from './WildcardTree.tsx'
import { YamlEditor } from './YamlEditor.tsx'

const TREE_REM = 16
const TREE_MIN_REM = 10

function remPx() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

function parentPath(path: string) {
  const cut = path.lastIndexOf('/')
  return cut >= 0 ? path.slice(0, cut) : ''
}

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

function remapPrefix(path: string, from: string, to: string) {
  if (path === from) {
    return to
  }
  if (from && path.startsWith(`${from}/`)) {
    return to + path.slice(from.length)
  }
  return path
}

function snapshot(file: WildcardFile, rawView: boolean) {
  if (file.format === 'txt') {
    return JSON.stringify(file.lines ?? [])
  }
  if (rawView || file.error || !file.tree) {
    return file.text ?? ''
  }
  return JSON.stringify(file.tree)
}

export function WildcardManagerScreen() {
  const location = useLocation()
  const active = location.pathname === '/wildcards'
  const rowRef = useRef<HTMLDivElement>(null)
  const [treeWidth, setTreeWidth] = useState(() => TREE_REM * 16)
  const [roots, setRoots] = useState<WildcardTreeNode[]>([])
  const [openDirs, setOpenDirs] = useState<Set<string>>(new Set())
  const [filePath, setFilePath] = useState<string | null>(null)
  const [folderPath, setFolderPath] = useState<string | null>(null)
  const [draft, setDraft] = useState<WildcardFile | null>(null)
  const [saved, setSaved] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [pendingMove, setPendingMove] = useState<{ path: string; folder: string; from: string; to: string } | null>(null)
  const [pendingRemove, setPendingRemove] = useState<string | null>(null)
  const [creating, setCreating] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ path: string; name: string } | null>(null)
  const [newName, setNewName] = useState('')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [raw, setRaw] = useState(false)
  const dirty = Boolean(draft && snapshot(draft, raw) !== saved)
  const pull = useModelsStore((s) => s.pull)
  const refreshKind = useModelsStore((s) => s.refreshKind)
  const modelsBusy = useModelsStore((s) => s.busy)
  const wildcardFiles = useModelsStore((s) => {
    const seen = new Set<string>()
    for (const item of s.wildcards) {
      const file = item.source || item.path.split('#')[0]
      if (file) {
        seen.add(file)
      }
    }
    return [...seen].sort().join('\n')
  })

  const loadTree = useCallback(async () => {
    const next = await getWildcardTree()
    setRoots(next)
    setOpenDirs((current) => {
      const open = new Set(current)
      for (const root of next) {
        open.add(root.path)
      }
      return open
    })
    setFolderPath((current) => current ?? next[0]?.path ?? '')
  }, [])

  const extraNames = useMemo(() => roots.map((node) => node.path).filter(Boolean), [roots])
  const shown = useMemo(() => filterWildcardTree(roots, query), [query, roots])
  const searchOpen = useMemo(() => {
    if (!query.trim()) {
      return null
    }
    const open = new Set<string>()
    function walk(nodes: WildcardTreeNode[]) {
      for (const node of nodes) {
        if (node.kind === 'dir') {
          open.add(node.path)
          walk(node.children || [])
        }
      }
    }
    walk(shown)
    return open
  }, [query, shown])

  useEffect(() => {
    setTreeWidth(TREE_REM * remPx())
  }, [])

  useEffect(() => {
    void loadTree().catch((err) => toast(err instanceof Error ? err.message : 'Could not load wildcards', 'error'))
  }, [loadTree, wildcardFiles])

  const openFile = useCallback(async (path: string) => {
    const file = await getWildcardFile(path)
    const rawView = Boolean(file.error)
    setDraft(file)
    setRaw(rawView)
    setSaved(snapshot(file, rawView))
    setFilePath(path)
    setFolderPath(parentPath(path))
    setOpenDirs((current) => {
      const next = new Set(current)
      let prefix = parentPath(path)
      while (true) {
        next.add(prefix)
        if (!prefix) {
          break
        }
        prefix = parentPath(prefix)
      }
      return next
    })
  }, [])

  function requestFile(path: string) {
    if (path === filePath) {
      return
    }
    if (draft && snapshot(draft, raw) !== saved) {
      setPending(path)
      return
    }
    void openFile(path).catch((err) => toast(err instanceof Error ? err.message : 'Could not open file', 'error'))
  }

  const save = useCallback(async () => {
    if (!draft || snapshot(draft, raw) === saved) {
      return true
    }
    setBusy(true)
    try {
      const body =
        draft.format === 'txt'
          ? { lines: draft.lines ?? [] }
          : raw || draft.error || !draft.tree
            ? { text: draft.text ?? '' }
            : { tree: draft.tree }
      const file = await saveWildcardFile(draft.path, body)
      setDraft(file)
      setSaved(snapshot(file, raw))
      toast('Saved', 'ok')
      await pull()
      return true
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save', 'error')
      return false
    } finally {
      setBusy(false)
    }
  }, [draft, pull, raw, saved])

  useEffect(() => {
    if (!active) {
      return
    }
    const incoming = location.state as { open?: string; dir?: boolean } | null
    if (!incoming || incoming.open === undefined) {
      return
    }
    if (incoming.dir) {
      setFolderPath(incoming.open)
      setOpenDirs((current) => {
        const next = new Set(current)
        let prefix = incoming.open || ''
        while (true) {
          next.add(prefix)
          if (!prefix) {
            break
          }
          prefix = parentPath(prefix)
        }
        return next
      })
      return
    }
    requestFile(incoming.open)
  }, [active, location.key])

  useEffect(() => {
    if (!active) {
      return
    }
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, save])

  async function create(ext: '.txt' | '.yaml') {
    const stem = newName.trim().replace(/\.(txt|ya?ml)$/i, '')
    if (!stem || creating === null) {
      return
    }
    if (draft && snapshot(draft, raw) !== saved) {
      toast('Save or discard changes first', 'info')
      return
    }
    setBusy(true)
    try {
      const file = await createWildcardFile(creating, `${stem}${ext}`)
      await loadTree()
      setOpenDirs((current) => new Set(current).add(creating))
      setDraft(file)
      setRaw(false)
      setSaved(snapshot(file, false))
      setFilePath(file.path)
      setFolderPath(parentPath(file.path))
      setCreating(null)
      setNewName('')
      await pull()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not create file', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function createFolder() {
    const stem = newName.trim().replace(/\.(txt|ya?ml)$/i, '')
    if (!stem || creating === null) {
      return
    }
    setBusy(true)
    try {
      const next = await createWildcardFolder(creating, stem)
      await loadTree()
      setOpenDirs((current) => {
        const dirs = new Set(current)
        dirs.add(creating)
        dirs.add(next.path)
        return dirs
      })
      setFolderPath(next.path)
      setCreating(null)
      setNewName('')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not create folder', 'error')
    } finally {
      setBusy(false)
    }
  }

  function setLines(lines: string[]) {
    if (!draft) {
      return
    }
    setDraft({ ...draft, lines })
  }

  function setTree(tree: Record<string, YamlNode>) {
    if (!draft) {
      return
    }
    setDraft({ ...draft, tree, error: undefined })
  }

  async function showRaw() {
    if (!draft || raw) {
      return
    }
    if (draft.format === 'yaml' && draft.tree && !draft.error) {
      setBusy(true)
      try {
        const next = await formatWildcardYaml({ tree: draft.tree })
        const file = { ...draft, text: next.text ?? '' }
        const wasDirty = snapshot(draft, false) !== saved
        setDraft(file)
        setRaw(true)
        if (!wasDirty) {
          setSaved(snapshot(file, true))
        }
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Could not dump YAML', 'error')
      } finally {
        setBusy(false)
      }
      return
    }
    setRaw(true)
  }

  async function showDashboard() {
    if (!draft || !raw) {
      return
    }
    if (draft.format === 'yaml') {
      setBusy(true)
      try {
        const next = await formatWildcardYaml({ text: draft.text ?? '' })
        if (next.error) {
          toast(next.error, 'error')
          return
        }
        const file = { ...draft, tree: next.tree ?? {}, error: undefined, text: draft.text }
        const wasDirty = snapshot(draft, true) !== saved
        setDraft(file)
        setRaw(false)
        if (!wasDirty) {
          setSaved(snapshot(file, false))
        }
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Could not parse YAML', 'error')
      } finally {
        setBusy(false)
      }
      return
    }
    setRaw(false)
  }

  async function reveal(path?: string) {
    const target = path ?? draft?.path
    if (target == null) {
      return
    }
    try {
      await revealWildcardFile(target ?? '')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not open folder', 'error')
    }
  }

  function retarget(from: string, to: string, kind: 'dir' | 'file') {
    const map = (path: string) => remapPrefix(path, from, to)
    setFilePath((current) => (current == null ? current : map(current)))
    setFolderPath((current) => (current == null ? current : map(current)))
    setDraft((current) => {
      if (!current) {
        return current
      }
      const path = map(current.path)
      return path === current.path ? current : { ...current, path }
    })
    setOpenDirs((current) => {
      const next = new Set<string>()
      for (const item of current) {
        next.add(map(item))
      }
      next.add(parentPath(to))
      if (kind === 'dir') {
        next.add(to)
      }
      return next
    })
  }

  async function moveEntry(path: string, folder: string) {
    setBusy(true)
    try {
      const next = await moveWildcardEntry(path, folder)
      retarget(path, next.path, next.kind)
      await loadTree()
      await pull()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not move', 'error')
    } finally {
      setBusy(false)
      setPendingMove(null)
    }
  }

  function requestMove(path: string, folder: string) {
    const from = scopeRoot(path, extraNames)
    const to = scopeRoot(folder, extraNames)
    if (from !== to) {
      setPendingMove({ path, folder, from, to })
      return
    }
    void moveEntry(path, folder)
  }

  async function renameEntry() {
    if (!renaming) {
      return
    }
    const name = renaming.name.trim()
    if (!name) {
      return
    }
    setBusy(true)
    try {
      const next = await renameWildcardEntry(renaming.path, name)
      retarget(renaming.path, next.path, next.kind)
      setRenaming(null)
      await loadTree()
      await pull()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not rename', 'error')
    } finally {
      setBusy(false)
    }
  }

  function coversPath(path: string, ident: string) {
    return path === ident || path.startsWith(`${ident}/`)
  }

  async function runRemove(ident: string) {
    setBusy(true)
    try {
      await trashEntry('wildcards', ident)
      if (filePath && coversPath(filePath, ident)) {
        setFilePath(null)
        setDraft(null)
        setSaved('')
      }
      setFolderPath((current) => {
        if (current == null || !coversPath(current, ident)) {
          return current
        }
        return parentPath(ident)
      })
      setPendingRemove(null)
      await loadTree()
      await pull()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not remove', 'error')
    } finally {
      setBusy(false)
    }
  }

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
      <aside className="flex min-h-0 shrink-0 flex-col pr-3" style={{ width: treeWidth }}>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <WildcardTree
            roots={shown}
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
            onSelectFolder={(path) => {
              setFolderPath(path)
            }}
            onMove={requestMove}
            onRename={(path, name) => setRenaming({ path, name })}
            onReveal={(path) => void reveal(path)}
            onRemove={(path) => setPendingRemove(path)}
            onAdd={(folder) => {
              setCreating(folder)
              setNewName('')
            }}
          />
        </div>
      </aside>
      <PaneSplitter
        value={treeWidth}
        onChange={setTreeWidth}
        onReset={() => setTreeWidth(TREE_REM * remPx())}
        min={TREE_MIN_REM * remPx()}
        containerRef={rowRef}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pl-4">
        <WildcardFileBar
          path={draft?.path ?? null}
          dirty={dirty}
          raw={raw}
          busy={busy}
          onRaw={() => void showRaw()}
          onDashboard={() => void showDashboard()}
          onReveal={() => void reveal()}
          onRename={() => {
            const path = draft?.path
            if (!path) {
              return
            }
            setRenaming({ path, name: path.slice(path.lastIndexOf('/') + 1) })
          }}
          onSave={() => void save()}
        />
        <div className="min-h-0 flex-1 overflow-y-auto pr-1 pb-8">
          {!draft ? (
            <p className="text-sm text-muted">Choose a .txt or .yaml file, or use + on a folder to add one.</p>
          ) : raw || (draft.format === 'yaml' && (draft.error || !draft.tree)) ? (
            <RawEditor
              key={draft.path}
              value={draft.format === 'txt' ? (draft.lines ?? []).join('\n') : (draft.text ?? '')}
              error={draft.error}
              yaml={draft.format === 'yaml'}
              onChange={(value) => {
                if (draft.format === 'txt') {
                  setLines(value.split('\n'))
                  return
                }
                setDraft({ ...draft, text: value, error: undefined })
              }}
            />
          ) : draft.format === 'txt' ? (
            <LineList value={draft.lines ?? ['']} onChange={setLines} />
          ) : (
            <YamlEditor value={draft.tree ?? {}} onChange={setTree} />
          )}
        </div>
      </div>
      </div>
      {pending ? (
        <ConfirmDialog
          title="Unsaved changes"
          body="Save this file before opening another?"
          onClose={() => setPending(null)}
          actions={[
            { label: 'Cancel', onClick: () => setPending(null) },
            {
              label: 'Discard',
              onClick: () => {
                const path = pending
                setPending(null)
                void openFile(path).catch((err) => toast(err instanceof Error ? err.message : 'Could not open file', 'error'))
              },
            },
            {
              label: 'Save',
              kind: 'primary',
              onClick: () => {
                const path = pending
                void save()
                  .then((ok) => {
                    if (!ok) {
                      return
                    }
                    setPending(null)
                    return openFile(path)
                  })
                  .catch((err) => toast(err instanceof Error ? err.message : 'Could not save', 'error'))
              },
            },
          ]}
        />
      ) : null}
      {pendingMove ? (
        <ConfirmDialog
          title="Move to another directory?"
          body={`This moves the item from ${pendingMove.from} to ${pendingMove.to}.`}
          onClose={() => setPendingMove(null)}
          actions={[
            { label: 'Cancel', onClick: () => setPendingMove(null) },
            {
              label: 'Move',
              kind: 'primary',
              onClick: () => void moveEntry(pendingMove.path, pendingMove.folder),
            },
          ]}
        />
      ) : null}
      {pendingRemove ? (
        <ConfirmDialog
          title="Move to Trash?"
          body="This can be restored from Settings → Trash."
          onClose={() => setPendingRemove(null)}
          actions={[
            { label: 'Cancel', onClick: () => setPendingRemove(null) },
            {
              label: 'Remove',
              kind: 'primary',
              danger: true,
              onClick: () => void runRemove(pendingRemove),
            },
          ]}
        />
      ) : null}
      {creating !== null ? (
        <WildcardCreateDialog
          folder={creating}
          name={newName}
          taken={siblingNames(roots, creating) ?? []}
          busy={busy}
          onName={setNewName}
          onClose={() => setCreating(null)}
          onCreateFile={(ext) => void create(ext)}
          onCreateFolder={() => void createFolder()}
        />
      ) : null}
      {renaming ? (
        <WildcardRenameDialog
          name={renaming.name}
          taken={siblingNames(roots, parentPath(renaming.path)) ?? []}
          busy={busy}
          onName={(name) => setRenaming({ ...renaming, name })}
          onClose={() => setRenaming(null)}
          onRename={() => void renameEntry()}
        />
      ) : null}
    </div>
  )
}
