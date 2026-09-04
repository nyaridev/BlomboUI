import {
  autoThumbScopes,
  createThumbScope,
  deleteThumbScope,
  getScopeThumbs,
  getThumbScopes,
  updateThumbScope,
  type ScopeThumb,
  type ThumbScope,
} from '@/lib/api.ts'
import { contextKey, galleryThumbView, readScopePack, selectedScopeIds, setAutoScopeIds, thumbView } from '@/lib/gallery/thumbView.ts'
import { galleryPackKey } from '@/stores/settings/constants.ts'
import { useGenerateStore } from '@/stores/generateStore.ts'
import { useIssuesStore } from '@/stores/issuesStore.ts'
import { useModelsStore } from '@/stores/modelsStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { create } from 'zustand'
import { useMemo } from 'react'

export const GLOBAL_SCOPE = 'global'

type ScopeState = {
  items: ThumbScope[]
  loaded: boolean
  autoKey: string
  thumbs: ScopeThumb[]
  thumbsLoaded: boolean
  load: () => Promise<void>
  loadThumbs: () => Promise<void>
  create: (body: Partial<ThumbScope>) => Promise<ThumbScope>
  update: (id: string, body: Partial<ThumbScope>) => Promise<ThumbScope>
  remove: (id: string) => Promise<void>
  setIds: (ids: string[]) => void
  toggleId: (id: string) => void
  replaceGroup: (id: string) => void
  setAuto: (value: boolean) => void
  setMode: (value: 'likely' | 'exact') => void
  toggleOptional: (id: string) => void
  refreshAuto: (prompt?: string) => Promise<void>
}

function refreshModels() {
  void useModelsStore.getState().pull()
}

function notifyIssues() {
  void useIssuesStore.getState().load()
}

function pinManual(ids?: string[]) {
  const settings = useSettingsStore.getState()
  const next = ids ?? selectedScopeIds()
  if (settings.thumbScopeAuto) {
    settings.setThumbScopeAuto(false)
  }
  settings.setThumbScopeIds(next)
}

export const useThumbnailScopeStore = create<ScopeState>((set, get) => ({
  items: [],
  loaded: false,
  autoKey: '',
  thumbs: [],
  thumbsLoaded: false,
  load: async () => {
    try {
      const items = await getThumbScopes()
      set({ items, loaded: true })
    } catch {
      set({ items: [], loaded: true })
    }
    await get().refreshAuto()
    refreshModels()
  },
  loadThumbs: async () => {
    try {
      const thumbs = await getScopeThumbs()
      set({ thumbs, thumbsLoaded: true })
    } catch {
      if (!get().thumbsLoaded) {
        set({ thumbs: [], thumbsLoaded: true })
      }
    }
  },
  create: async (body) => {
    const row = await createThumbScope(body)
    set((state) => ({ items: [...state.items.filter((item) => item.id !== row.id), row] }))
    const settings = useSettingsStore.getState()
    if (!settings.scopeOrder.includes(row.id)) {
      settings.setScopeOrder([...settings.scopeOrder, row.id])
    }
    notifyIssues()
    return row
  },
  update: async (id, body) => {
    const row = await updateThumbScope(id, body)
    set((state) => ({ items: state.items.map((item) => (item.id === id ? row : item)) }))
    notifyIssues()
    return row
  },
  remove: async (id) => {
    await deleteThumbScope(id)
    set((state) => ({ items: state.items.filter((item) => item.id !== id) }))
    const ids = selectedScopeIds().filter((item) => item !== id)
    const settings = useSettingsStore.getState()
    settings.setThumbScopeIds(ids)
    settings.setThumbScopeOptionalIds(settings.thumbScopeOptionalIds.filter((item) => item !== id))
    settings.setScopeOrder(settings.scopeOrder.filter((item) => item !== id))
    settings.setLookupScopeIds(settings.lookupScopeIds.filter((item) => item !== id))
    settings.setLookupScopeOptionalIds(settings.lookupScopeOptionalIds.filter((item) => item !== id))
    settings.dropGalleryLocalScopeId(id)
    await get().refreshAuto()
    refreshModels()
    notifyIssues()
  },
  setIds: (ids) => {
    pinManual(ids.filter((id) => id && id !== GLOBAL_SCOPE))
    refreshModels()
  },
  toggleId: (id) => {
    if (id === GLOBAL_SCOPE) {
      pinManual([])
      refreshModels()
      return
    }
    const current = selectedScopeIds()
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    pinManual(next)
    refreshModels()
  },
  replaceGroup: (id) => {
    const items = get().items
    const row = items.find((item) => item.id === id)
    if (!row || row.id === GLOBAL_SCOPE) {
      get().toggleId(id)
      return
    }
    if (selectedScopeIds().includes(id)) {
      get().toggleId(id)
      return
    }
    const group = row.group.trim().toLowerCase()
    const current = selectedScopeIds().filter((item) => {
      if (item === id) {
        return false
      }
      if (!group) {
        return true
      }
      const other = items.find((entry) => entry.id === item)
      return (other?.group || '').trim().toLowerCase() !== group
    })
    pinManual([...current, id])
    refreshModels()
  },
  setAuto: (value) => {
    const prev = useSettingsStore.getState().thumbScopeAuto
    useSettingsStore.getState().setThumbScopeAuto(value)
    void get().refreshAuto()
    if (prev !== value) {
      refreshModels()
    }
  },
  setMode: (value) => {
    useSettingsStore.getState().setThumbDisplayMode(value)
    refreshModels()
  },
  toggleOptional: (id) => {
    if (!id || id === GLOBAL_SCOPE) {
      return
    }
    const settings = useSettingsStore.getState()
    const current = settings.thumbScopeOptionalIds
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    settings.setThumbScopeOptionalIds(next)
    refreshModels()
  },
  refreshAuto: async (prompt) => {
    const text = prompt ?? useGenerateStore.getState().prompt
    let ids: string[] = []
    try {
      ids = await autoThumbScopes(text)
    } catch {
      ids = []
    }
    const autoKey = ids.join('+')
    if (autoKey === get().autoKey) {
      return
    }
    setAutoScopeIds(ids)
    set({ autoKey })
    if (
      useSettingsStore.getState().thumbScopeAuto ||
      Object.values(useSettingsStore.getState().galleryLocalScopes).some((pack) => pack.auto)
    ) {
      refreshModels()
    }
  },
}))

export function currentThumbView() {
  return thumbView()
}

export function currentContextKey() {
  return contextKey()
}

export function useThumbView(kind?: string, scopeKey?: string) {
  const resolved =
    scopeKey ?? (kind && kind !== 'trash' ? galleryPackKey(kind) : GLOBAL_SCOPE)
  const ids = useSettingsStore((s) => s.thumbScopeIds.join('+'))
  const optional = useSettingsStore((s) => s.thumbScopeOptionalIds.join('+'))
  const auto = useSettingsStore((s) => s.thumbScopeAuto)
  const mode = useSettingsStore((s) => s.thumbDisplayMode)
  const gallery = useSettingsStore((s) => s.galleryThumbFallback)
  const trash = useSettingsStore((s) => s.trashThumbFallback)
  const local = useSettingsStore((s) =>
    resolved && resolved !== GLOBAL_SCOPE ? s.galleryLocalScopes[resolved] : null,
  )
  const autoKey = useThumbnailScopeStore((s) => s.autoKey)
  return useMemo(
    () => (kind ? galleryThumbView(kind, resolved) : thumbView(readScopePack(resolved).fallback, resolved)),
    [kind, resolved, ids, optional, auto, mode, gallery, trash, local, autoKey],
  )
}
