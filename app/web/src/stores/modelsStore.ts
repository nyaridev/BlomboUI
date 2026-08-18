import { create } from 'zustand'
import { getModels, refreshModels, type ModelLists } from '@/lib/api.ts'

const EMPTY: ModelLists = {
  checkpoints: [],
  loras: [],
  vae: [],
  controlnet: [],
  embeddings: [],
  wildcards: [],
}

type ModelsState = ModelLists & {
  busy: boolean
  load: () => Promise<void>
  refresh: () => Promise<void>
}

function apply(lists: ModelLists): ModelLists {
  return {
    checkpoints: lists.checkpoints ?? [],
    loras: lists.loras ?? [],
    vae: lists.vae ?? [],
    controlnet: lists.controlnet ?? [],
    embeddings: lists.embeddings ?? [],
    wildcards: lists.wildcards ?? [],
  }
}

export const useModelsStore = create<ModelsState>((set, get) => ({
  ...EMPTY,
  busy: false,
  load: async () => {
    if (get().busy) {
      return
    }
    set({ busy: true })
    try {
      set(apply(await getModels()))
    } catch {
      /* keep current */
    } finally {
      set({ busy: false })
    }
  },
  refresh: async () => {
    if (get().busy) {
      return
    }
    set({ busy: true })
    try {
      set(apply(await refreshModels()))
    } catch {
      try {
        set(apply(await getModels()))
      } catch {
        /* keep current */
      }
    } finally {
      set({ busy: false })
    }
  },
}))

export function modelLabel(id: string) {
  return id.replace(/\.[^/.]+$/, '')
}
