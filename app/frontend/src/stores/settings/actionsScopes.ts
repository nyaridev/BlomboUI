import type { SettingsState } from '../settingsStore.ts'
import type { SettingsSet } from './actionTypes.ts'
import { cleanCivitaiBrowse } from '@/lib/civitai/browse.ts'
import { cleanCivitaiTabId, cleanCivitaiTabs } from '@/lib/civitai/version.ts'
import {
  cleanFilterScopeIds,
  cleanLookupKinds,
  cleanLookupModels,
  cleanModelsKind,
  cleanModelsTab,
  cleanNames,
  cleanScopeIds,
  cleanTypeList,
  emptyLocalScope,
} from './clean.ts'
import {
  GALLERY_PACK_KEY_SET,
  LOCAL_SCOPE_DEFAULT,
  type GalleryLocalScope,
} from './constants.ts'

export function createScopeActions(set: SettingsSet, persist: () => void): Partial<SettingsState> {
  return {
    setGalleryThumbFallback: (galleryThumbFallback) => {
      set({ galleryThumbFallback })
      persist()
    },
    setThumbSaveTo: (thumbSaveTo) => {
      set({ thumbSaveTo: thumbSaveTo === 'global' ? 'global' : 'active' })
      persist()
    },
    setThumbDisplayMode: (thumbDisplayMode) => {
      set({ thumbDisplayMode: thumbDisplayMode === 'exact' ? 'exact' : 'likely' })
      persist()
    },
    setThumbScopeIds: (thumbScopeIds) => {
      set({ thumbScopeIds: cleanScopeIds(thumbScopeIds) })
      persist()
    },
    setThumbScopeOptionalIds: (thumbScopeOptionalIds) => {
      set({ thumbScopeOptionalIds: cleanScopeIds(thumbScopeOptionalIds) })
      persist()
    },
    setThumbScopeAuto: (thumbScopeAuto) => {
      set({ thumbScopeAuto })
      persist()
    },
    setTrashThumbFallback: (trashThumbFallback) => {
      set({ trashThumbFallback })
      persist()
    },
    setScopeGroups: (scopeGroups) => {
      set({ scopeGroups: cleanNames(scopeGroups) })
      persist()
    },
    setScopeOrder: (scopeOrder) => {
      set({ scopeOrder: cleanScopeIds(scopeOrder) })
      persist()
    },
    setLookupScopeIds: (lookupScopeIds) => {
      const next = cleanFilterScopeIds(lookupScopeIds)
      set((state) => ({
        lookupScopeIds: next,
        lookupScopeOptionalIds: state.lookupScopeOptionalIds.filter((id) => next.includes(id)),
      }))
      persist()
    },
    setLookupScopeOptionalIds: (lookupScopeOptionalIds) => {
      set((state) => ({
        lookupScopeOptionalIds: cleanScopeIds(lookupScopeOptionalIds).filter((id) => state.lookupScopeIds.includes(id)),
      }))
      persist()
    },
    setLookupKinds: (lookupKinds) => {
      set({ lookupKinds: cleanLookupKinds(lookupKinds) })
      persist()
    },
    setLookupModels: (lookupModels) => {
      set({ lookupModels: cleanLookupModels(lookupModels) })
      persist()
    },
    setScopeSearch: (scopeSearch) => {
      set({ scopeSearch: typeof scopeSearch === 'string' ? scopeSearch.slice(0, 200) : '' })
      persist()
    },
    setModelsTab: (modelsTab) => {
      set({ modelsTab: cleanModelsTab(modelsTab) })
      persist()
    },
    setModelsKind: (modelsKind) => {
      set({ modelsKind: cleanModelsKind(modelsKind) })
      persist()
    },
    setCivitaiBrowse: (patch) => {
      set((state) => ({ civitaiBrowse: cleanCivitaiBrowse({ ...state.civitaiBrowse, ...patch }) }))
      persist()
    },
    setCivitaiTabs: (civitaiTabs) => {
      set((state) => {
        const tabs = cleanCivitaiTabs(civitaiTabs)
        return { civitaiTabs: tabs, civitaiTabId: cleanCivitaiTabId(state.civitaiTabId, tabs) }
      })
      persist()
    },
    setCivitaiTabId: (civitaiTabId) => {
      set((state) => ({ civitaiTabId: cleanCivitaiTabId(civitaiTabId, state.civitaiTabs) }))
      persist()
    },
    setGalleryTypes: (key, value) => {
      if (!GALLERY_PACK_KEY_SET.has(key)) {
        return
      }
      set((state) => {
        const types = cleanTypeList(value)
        const galleryTypes = { ...state.galleryTypes }
        if (types.length) {
          galleryTypes[key] = types
        } else {
          delete galleryTypes[key]
        }
        return { galleryTypes }
      })
      persist()
    },
    setGalleryQuery: (key, value) => {
      if (!GALLERY_PACK_KEY_SET.has(key)) {
        return
      }
      set((state) => {
        const text = typeof value === 'string' ? value.slice(0, 200) : ''
        const galleryQuery = { ...state.galleryQuery }
        if (text) {
          galleryQuery[key] = text
        } else {
          delete galleryQuery[key]
        }
        return { galleryQuery }
      })
      persist()
    },
    setGalleryLocalScope: (key, patch) => {
      if (!GALLERY_PACK_KEY_SET.has(key)) {
        return
      }
      set((state) => {
        const prev = state.galleryLocalScopes[key] ?? LOCAL_SCOPE_DEFAULT
        const next: GalleryLocalScope = {
          ids: patch.ids ? cleanScopeIds(patch.ids) : prev.ids,
          optionalIds: patch.optionalIds ? cleanScopeIds(patch.optionalIds) : prev.optionalIds,
          auto: patch.auto ?? prev.auto,
          mode: patch.mode ?? prev.mode,
          fallback: patch.fallback ?? prev.fallback,
        }
        const galleryLocalScopes = { ...state.galleryLocalScopes }
        if (emptyLocalScope(next)) {
          delete galleryLocalScopes[key]
        } else {
          galleryLocalScopes[key] = next
        }
        return { galleryLocalScopes }
      })
      persist()
    },
    dropGalleryLocalScopeId: (id) => {
      if (!id) {
        return
      }
      set((state) => {
        const galleryLocalScopes: Record<string, GalleryLocalScope> = {}
        for (const [key, pack] of Object.entries(state.galleryLocalScopes)) {
          const next = {
            ...pack,
            ids: pack.ids.filter((item) => item !== id),
            optionalIds: pack.optionalIds.filter((item) => item !== id),
          }
          if (!emptyLocalScope(next)) {
            galleryLocalScopes[key] = next
          }
        }
        return { galleryLocalScopes }
      })
      persist()
    },
    setGalleryAutoTypes: (key, value) => {
      if (!GALLERY_PACK_KEY_SET.has(key)) {
        return
      }
      set((state) => {
        const galleryAutoTypes = { ...state.galleryAutoTypes }
        if (value) {
          galleryAutoTypes[key] = true
        } else {
          delete galleryAutoTypes[key]
        }
        return { galleryAutoTypes }
      })
      persist()
    },
    setGalleryPinSelected: (key, value) => {
      if (!GALLERY_PACK_KEY_SET.has(key)) {
        return
      }
      set((state) => {
        const galleryPinSelected = { ...state.galleryPinSelected }
        if (value) {
          delete galleryPinSelected[key]
        } else {
          galleryPinSelected[key] = false
        }
        return { galleryPinSelected }
      })
      persist()
    },
  }
}
