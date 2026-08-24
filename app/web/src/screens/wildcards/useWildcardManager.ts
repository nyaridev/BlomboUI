import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
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
  isUnreachable,
  removeEntry as trashEntry,
  type WildcardFile,
  type WildcardTreeNode,
  type YamlNode,
} from '@/lib/api.ts'
import { scopeRoot } from '@/lib/gallery/tree.ts'
import { useModelsStore } from '@/stores/modelsStore.ts'
import { toast } from '@/stores/toastStore.ts'
import { filterWildcardTree } from './WildcardTree.tsx'

function parentPath(path: string) {
  const cut = path.lastIndexOf('/')
  return cut >= 0 ? path.slice(0, cut) : ''
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

export function useWildcardManager() {
  const location = useLocation()
  const active = location.pathname === '/wildcards'
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
    if (!active) {
      return
    }
    void loadTree().catch((err) => {
      if (isUnreachable(err)) {
        return
      }
      toast(err instanceof Error ? err.message : 'Could not load wildcards', 'error')
    })
  }, [active, loadTree, wildcardFiles])

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
    if (draft) {
      setDraft({ ...draft, lines })
    }
  }

  function setTree(tree: Record<string, YamlNode>) {
    if (draft) {
      setDraft({ ...draft, tree, error: undefined })
    }
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
      await revealWildcardFile(target)
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

  return {
    roots,
    shown,
    searchOpen,
    openDirs,
    setOpenDirs,
    filePath,
    folderPath,
    setFolderPath,
    draft,
    setDraft,
    saved,
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
    loadTree,
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
    refreshKind,
    modelsBusy,
  }
}
