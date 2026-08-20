import {
  autoThumbScopes,
  createThumbScope,
  deleteThumbScope,
  getThumbScopes,
  updateThumbScope,
  type ThumbScope,
} from '@/lib/api.ts'
import { contextKey, galleryThumbView, selectedScopeIds, setAutoScopeIds, thumbView } from '@/lib/thumbView.ts'
import { useGenerateStore } from '@/stores/generateStore.ts'
import { useModelsStore } from '@/stores/modelsStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { create } from 'zustand'
import { useMemo } from 'react'

export const GLOBAL_SCOPE = 'global'

type ScopeState = {
  items: ThumbScope[]
  loaded: boolean
  autoKey: string
  load: () => Promise<void>
  create: (body: Partial<ThumbScope>) => Promise<ThumbScope>
  update: (id: string, body: Partial<ThumbScope>) => Promise<ThumbScope>
  remove: (id: string) => Promise<void>
  setIds: (ids: string[]) => void
  toggleId: (id: string) => void
  replaceGroup: (id: string) => void
  setAuto: (value: boolean) => void
  setMode: (value: 'likely' | 'exact') => void
  refreshAuto: (prompt?: string) => Promise<void>
}

function refreshModels() {
  void useModelsStore.getState().pull()
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
  create: async (body) => {
    const row = await createThumbScope(body)
    set((state) => ({ items: [...state.items.filter((item) => item.id !== row.id), row] }))
    return row
  },
  update: async (id, body) => {
    const row = await updateThumbScope(id, body)
    set((state) => ({ items: state.items.map((item) => (item.id === id ? row : item)) }))
    return row
  },
  remove: async (id) => {
    await deleteThumbScope(id)
    set((state) => ({ items: state.items.filter((item) => item.id !== id) }))
    const ids = selectedScopeIds().filter((item) => item !== id)
    useSettingsStore.getState().setThumbScopeIds(ids)
    await get().refreshAuto()
    refreshModels()
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
    useSettingsStore.getState().setThumbScopeAuto(value)
    void get().refreshAuto()
  },
  setMode: (value) => {
    useSettingsStore.getState().setThumbDisplayMode(value)
    refreshModels()
  },
  refreshAuto: async (prompt) => {
    const text = prompt ?? useGenerateStore.getState().prompt
    try {
      const ids = await autoThumbScopes(text)
      setAutoScopeIds(ids)
      set({ autoKey: ids.join('+') })
    } catch {
      setAutoScopeIds([])
      set({ autoKey: '' })
    }
    if (useSettingsStore.getState().thumbScopeAuto) {
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

export function useThumbView(kind?: string) {
  const ids = useSettingsStore((s) => s.thumbScopeIds.join('+'))
  const auto = useSettingsStore((s) => s.thumbScopeAuto)
  const mode = useSettingsStore((s) => s.thumbDisplayMode)
  const gallery = useSettingsStore((s) => s.galleryThumbFallback)
  const trash = useSettingsStore((s) => s.trashThumbFallback)
  const autoKey = useThumbnailScopeStore((s) => s.autoKey)
  return useMemo(
    () => (kind ? galleryThumbView(kind) : thumbView()),
    [kind, ids, auto, mode, gallery, trash, autoKey],
  )
}
