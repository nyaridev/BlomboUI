import { useState, type Dispatch, type SetStateAction } from 'react'
import { toast } from '@/stores/toastStore.ts'
import {
  createModelFolder,
  createWildcardFolder,
  moveModelEntry,
  moveWildcardEntry,
  renameModelEntry,
  renameWildcardEntry,
  removeEntry as trashEntry,
  revealModelFile,
  revealWildcardFile,
  type CivitaiVersion,
  type ModelLists,
} from '@/lib/api.ts'
import { applyCivitaiMeta, civitaiHashes, hasCivitaiLocalData, lookupCivitai, waitModelInfo } from '@/lib/civitai/fill.ts'
import { civitaiSaveThumbView } from '@/lib/gallery/thumbView.ts'
import {
  dirExists,
  identToDisplay,
  parentIdent,
  scopeRoot,
} from '@/lib/gallery/tree.ts'

type NameState = { folder: string; name: string }
type RenameState = { path: string; name: string }
type MoveState = { path: string; folder: string; from: string; to: string }
type FillConfirm = { path: string; hit: CivitaiVersion; kind: keyof ModelLists }

export function useGalleryFileOps({
  kind,
  extraNames,
  paths,
  treeDirs,
  savedOpenDirs,
  query,
  setQuery,
  parentOnUnselect,
  onSelect,
  value,
  pull,
  loadTree,
  setThumb,
  setMeta,
}: {
  kind: keyof ModelLists
  extraNames: string[]
  paths: string[]
  treeDirs: Set<string>
  savedOpenDirs?: string[]
  query: string
  setQuery: (update: string | ((current: string) => string)) => void
  parentOnUnselect: boolean
  onSelect?: (id: string) => void
  value?: string
  pull: () => Promise<void>
  loadTree: () => Promise<void>
  setThumb: (kind: keyof ModelLists, path: string, tick: number) => void
  setMeta: (kind: keyof ModelLists, path: string, meta: { prompt?: string }) => void
}) {
  const [openDirs, setOpenDirs] = useState<Set<string>>(
    () => new Set(savedOpenDirs?.length ? savedOpenDirs : ['Local']),
  )
  const [fillConfirm, setFillConfirm] = useState<FillConfirm | null>(null)
  const [filling, setFilling] = useState<string | null>(null)
  const [fileBusy, setFileBusy] = useState(false)
  const [creating, setCreating] = useState<NameState | null>(null)
  const [renaming, setRenaming] = useState<RenameState | null>(null)
  const [pendingMove, setPendingMove] = useState<MoveState | null>(null)
  const [pendingRemove, setPendingRemove] = useState<string | null>(null)

  function folderExists(path: string) {
    return treeDirs.has(path) || dirExists(paths, path)
  }

  function applyRelocate(fromIdent: string, toIdent: string, entryKind: 'dir' | 'file') {
    const fromDisplay = identToDisplay(fromIdent, extraNames)
    const toDisplay = identToDisplay(toIdent, extraNames)
    if (onSelect && value) {
      const next = fromIdent === value ? toIdent : value.startsWith(`${fromIdent}/`) ? toIdent + value.slice(fromIdent.length) : value
      if (next !== value) {
        onSelect(next)
      }
    }
    setQuery((current) => {
      if (current === fromDisplay) {
        return toDisplay
      }
      return current.startsWith(`${fromDisplay}/`) ? toDisplay + current.slice(fromDisplay.length) : current
    })
    setOpenDirs((current) => {
      const next = new Set<string>()
      for (const path of current) {
        next.add(path === fromDisplay ? toDisplay : path.startsWith(`${fromDisplay}/`) ? toDisplay + path.slice(fromDisplay.length) : path)
      }
      const parent = identToDisplay(parentIdent(toIdent), extraNames)
      if (parent) {
        next.add(parent)
      }
      if (entryKind === 'dir') {
        next.add(toDisplay)
      }
      return next
    })
  }

  async function runMove(path: string, folder: string) {
    setFileBusy(true)
    try {
      const next = kind === 'wildcards' ? await moveWildcardEntry(path, folder) : await moveModelEntry(kind, path, folder)
      applyRelocate(path, next.path, next.kind)
      await pull()
      await loadTree()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not move', 'error')
    } finally {
      setFileBusy(false)
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
    void runMove(path, folder)
  }

  async function saveCivitai(path: string, hit: CivitaiVersion, itemKind: keyof ModelLists = kind) {
    const info = await waitModelInfo(itemKind, path, undefined, civitaiSaveThumbView(itemKind))
    const next = await applyCivitaiMeta(itemKind, path, hit, { types: info.types || [], prompt: info.prompt || '' })
    if (next.thumb) {
      setThumb(itemKind, path, next.thumb)
    }
    if (itemKind === 'loras') {
      setMeta(itemKind, path, { prompt: next.prompt })
    }
  }

  async function downloadCivitai(path: string, itemKind: keyof ModelLists = kind) {
    if (filling) {
      return
    }
    setFilling(path)
    try {
      const info = await waitModelInfo(itemKind, path, undefined, civitaiSaveThumbView(itemKind))
      const hit = await lookupCivitai(civitaiHashes(info))
      if (!hit) {
        return
      }
      if (hasCivitaiLocalData(info, itemKind === 'loras')) {
        setFillConfirm({ path, hit, kind: itemKind })
        return
      }
      await saveCivitai(path, hit, itemKind)
    } catch {
      /* keep current */
    } finally {
      setFilling(null)
    }
  }

  async function replaceCivitai() {
    if (!fillConfirm) {
      return
    }
    const next = fillConfirm
    setFillConfirm(null)
    setFilling(next.path)
    try {
      await saveCivitai(next.path, next.hit, next.kind)
    } finally {
      setFilling(null)
    }
  }

  function clickDir(path: string) {
    const open = openDirs.has(path)
    const same = query.trim() === path
    if (!open) {
      setOpenDirs((current) => new Set(current).add(path))
      setQuery(path)
      return
    }
    if (same) {
      setOpenDirs((current) => {
        const next = new Set(current)
        next.delete(path)
        return next
      })
      if (parentOnUnselect) {
        const cut = path.lastIndexOf('/')
        const parent = cut > 0 ? path.slice(0, cut) : ''
        setQuery(parent && folderExists(parent) ? parent : '')
      } else {
        setQuery('')
      }
      return
    }
    setQuery(path)
  }

  function clickFile(path: string) {
    const same = query.trim() === path
    if (same) {
      const cut = path.lastIndexOf('/')
      const parent = cut > 0 ? path.slice(0, cut) : ''
      setQuery(parentOnUnselect && parent && folderExists(parent) ? parent : '')
      return
    }
    setQuery(path)
  }

  async function createFolder() {
    if (!creating || fileBusy) {
      return
    }
    const name = creating.name.trim()
    if (!name) {
      return
    }
    setFileBusy(true)
    try {
      const next = kind === 'wildcards' ? await createWildcardFolder(creating.folder, name) : await createModelFolder(kind, creating.folder, name)
      const display = identToDisplay(next.path, extraNames)
      setOpenDirs((current) => new Set(current).add(identToDisplay(creating.folder, extraNames)).add(display))
      setQuery(display)
      setCreating(null)
      await loadTree()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not create folder', 'error')
    } finally {
      setFileBusy(false)
    }
  }

  async function renameEntry() {
    if (!renaming || fileBusy) {
      return
    }
    const name = renaming.name.trim()
    if (!name) {
      return
    }
    setFileBusy(true)
    try {
      const next = kind === 'wildcards' ? await renameWildcardEntry(renaming.path, name) : await renameModelEntry(kind, renaming.path, name)
      applyRelocate(renaming.path, next.path, next.kind)
      setRenaming(null)
      await pull()
      await loadTree()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not rename', 'error')
    } finally {
      setFileBusy(false)
    }
  }

  async function revealEntry(path: string) {
    try {
      if (kind === 'wildcards') {
        await revealWildcardFile(path)
      } else {
        await revealModelFile(kind, path)
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not open folder', 'error')
    }
  }

  async function runRemove(ident: string) {
    setFileBusy(true)
    try {
      await trashEntry(kind, ident)
      if (onSelect && value && (value === ident || value.startsWith(`${ident}/`) || value.startsWith(`${ident}#`))) {
        onSelect('')
      }
      const display = identToDisplay(ident, extraNames)
      setQuery((current) => {
        if (current === display || current.startsWith(`${display}/`)) {
          return identToDisplay(parentIdent(ident), extraNames)
        }
        return current
      })
      setPendingRemove(null)
      await pull()
      await loadTree()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not remove', 'error')
    } finally {
      setFileBusy(false)
    }
  }

  return {
    openDirs,
    setOpenDirs: setOpenDirs as Dispatch<SetStateAction<Set<string>>>,
    fillConfirm,
    setFillConfirm,
    filling,
    fileBusy,
    creating,
    setCreating,
    renaming,
    setRenaming,
    pendingMove,
    setPendingMove,
    pendingRemove,
    setPendingRemove,
    folderExists,
    requestMove,
    runMove,
    saveCivitai,
    downloadCivitai,
    replaceCivitai,
    clickDir,
    clickFile,
    createFolder,
    renameEntry,
    revealEntry,
    runRemove,
  }
}
