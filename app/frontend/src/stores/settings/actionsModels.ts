import { LOCAL_ID, OUTPUT_ID } from '@/components/controls/folder-list/FolderList.tsx'
import { cleanCivitaiDownload } from '@/lib/civitai/download.ts'
import type { SettingsState } from '../settingsStore.ts'
import type { SettingsSet } from './actionTypes.ts'
import {
  cleanDirs,
  cleanDownloadQueueParallel,
  cleanListTypes,
  cleanRemovedHours,
  cleanRemovedMaxGb,
} from './clean.ts'
import { AUTOCOMPLETE_LIST_DEFAULT, autocompleteListRule } from './constants.ts'
import { ensureLocal } from './clean.ts'

export function createModelActions(set: SettingsSet, persist: () => void): Partial<SettingsState> {
  return {
    setModelDirs: (modelDirs) => {
      set((state) => {
        const nextDirs = ensureLocal(cleanDirs(modelDirs))
        return {
          modelDirs: nextDirs,
          civitaiDownload: cleanCivitaiDownload(state.civitaiDownload, nextDirs, state.wildcardDirs),
        }
      })
      persist()
    },
    setWildcardDirs: (wildcardDirs) => {
      set((state) => {
        const nextDirs = ensureLocal(cleanDirs(wildcardDirs))
        return {
          wildcardDirs: nextDirs,
          civitaiDownload: cleanCivitaiDownload(state.civitaiDownload, state.modelDirs, nextDirs),
        }
      })
      persist()
    },
    setGalleryDirs: (galleryDirs) => {
      set({ galleryDirs: cleanDirs(galleryDirs).filter((item) => item.id !== LOCAL_ID && item.id !== OUTPUT_ID) })
      persist()
    },
    setCivitaiDownload: (patch) => {
      set((state) => ({
        civitaiDownload: cleanCivitaiDownload(
          { ...state.civitaiDownload, ...patch },
          state.modelDirs,
          state.wildcardDirs,
        ),
      }))
      persist()
    },
    setDownloadQueue: (downloadQueue) => {
      set({ downloadQueue })
      persist()
    },
    setDownloadQueueParallel: (downloadQueueParallel) => {
      set({ downloadQueueParallel: cleanDownloadQueueParallel(downloadQueueParallel) })
      persist()
    },
    setRemovedAfterHours: (removedAfterHours) => {
      set({ removedAfterHours: cleanRemovedHours(removedAfterHours) })
      persist()
    },
    setRemovedMaxGb: (removedMaxGb) => {
      set({ removedMaxGb: cleanRemovedMaxGb(removedMaxGb) })
      persist()
    },
    setAutocompleteEnabled: (autocompleteEnabled) => {
      set({ autocompleteEnabled })
      persist()
    },
    setAutocompleteMode: (autocompleteMode) => {
      set({ autocompleteMode })
      persist()
    },
    setAutocompleteTypes: (autocompleteTypes) => {
      set({ autocompleteTypes: cleanListTypes(autocompleteTypes) })
      persist()
    },
    setWildcardCompleteEnabled: (wildcardCompleteEnabled) => {
      set({ wildcardCompleteEnabled })
      persist()
    },
    setLoraCompleteEnabled: (loraCompleteEnabled) => {
      set({ loraCompleteEnabled })
      persist()
    },
    setLoraTriggerCompleteEnabled: (loraTriggerCompleteEnabled) => {
      set({ loraTriggerCompleteEnabled })
      persist()
    },
    setWildcardCompleteThumbs: (wildcardCompleteThumbs) => {
      set({ wildcardCompleteThumbs })
      persist()
    },
    setLoraCompleteThumbs: (loraCompleteThumbs) => {
      set({ loraCompleteThumbs })
      persist()
    },
    setFrequentTagsEnabled: (frequentTagsEnabled) => {
      set({ frequentTagsEnabled })
      persist()
    },
    setAutocompleteList: (name, patch) => {
      set((state) => {
        const prev = autocompleteListRule(state.autocompleteLists, name)
        const next = {
          enabled: patch.enabled ?? prev.enabled,
          mode: patch.mode ?? prev.mode,
          types: patch.types ?? prev.types,
        }
        const autocompleteLists = { ...state.autocompleteLists, [name]: next }
        if (
          next.enabled === AUTOCOMPLETE_LIST_DEFAULT.enabled &&
          next.mode === AUTOCOMPLETE_LIST_DEFAULT.mode &&
          next.types.length === 0
        ) {
          delete autocompleteLists[name]
        }
        return { autocompleteLists }
      })
      persist()
    },
  }
}
