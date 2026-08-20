import { create } from 'zustand'
import { getModels, refreshModels, type ModelEntry, type ModelLists } from '@/lib/api.ts'
import { useIssuesStore } from '@/stores/issuesStore.ts'
import { toast, toastIssues } from '@/stores/toastStore.ts'

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
  refreshKind: (kind: keyof ModelLists) => Promise<void>
  setThumb: (kind: keyof ModelLists, path: string, thumb: number) => void
  setMeta: (
    kind: keyof ModelLists,
    path: string,
    meta: { prompt?: string; negative_prompt?: string; notes?: string; strength?: number; slider?: boolean },
  ) => void
}

function asEntry(item: unknown): ModelEntry | null {
  if (typeof item === 'string' && item) {
    return { path: item, added: 0, edited: 0, size: 0 }
  }
  if (item && typeof item === 'object' && 'path' in item) {
    const row = item as ModelEntry
    if (typeof row.path === 'string' && row.path) {
      return {
        path: row.path,
        added: Number(row.added) || 0,
        edited: Number(row.edited) || 0,
        size: Number(row.size) || 0,
        thumb: Number(row.thumb) || 0,
        prompt: typeof row.prompt === 'string' ? row.prompt : '',
        negative_prompt: typeof row.negative_prompt === 'string' ? row.negative_prompt : '',
        notes: typeof row.notes === 'string' ? row.notes : '',
        strength: Number.isFinite(Number(row.strength)) ? Number(row.strength) : 1,
        slider: Boolean(row.slider),
        label: typeof row.label === 'string' ? row.label : '',
        tag: typeof row.tag === 'string' ? row.tag : '',
        source: typeof row.source === 'string' ? row.source : '',
        dir: Boolean(row.dir),
        entries: Array.isArray(row.entries)
          ? row.entries.filter((item): item is string => typeof item === 'string' && Boolean(item))
          : [],
      }
    }
  }
  return null
}

function asList(items: unknown): ModelEntry[] {
  if (!Array.isArray(items)) {
    return []
  }
  return items.map(asEntry).filter((item): item is ModelEntry => item != null)
}

function apply(lists: Partial<ModelLists>): ModelLists {
  return {
    checkpoints: asList(lists.checkpoints),
    loras: asList(lists.loras),
    vae: asList(lists.vae),
    controlnet: asList(lists.controlnet),
    embeddings: asList(lists.embeddings),
    wildcards: asList(lists.wildcards),
  }
}

function notifyIssues() {
  void useIssuesStore.getState().load().then((items) => toastIssues(items))
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
      void notifyIssues()
    }
  },
  refresh: async () => {
    if (get().busy) {
      return
    }
    set({ busy: true })
    try {
      set(apply(await refreshModels()))
      toast('Models reloaded', 'ok')
    } catch {
      try {
        set(apply(await getModels()))
        toast('Models reloaded', 'ok')
      } catch {
        /* keep current */
      }
    } finally {
      set({ busy: false })
      void notifyIssues()
    }
  },
  refreshKind: async (kind) => {
    if (get().busy) {
      return
    }
    set({ busy: true })
    try {
      const lists = await refreshModels(kind)
      set({ [kind]: asList(lists[kind]) })
      toast('Models reloaded', 'ok')
    } catch {
      try {
        const lists = await getModels()
        set({ [kind]: asList(lists[kind]) })
        toast('Models reloaded', 'ok')
      } catch {
        /* keep current */
      }
    } finally {
      set({ busy: false })
      void notifyIssues()
    }
  },
  setThumb: (kind, path, thumb) => {
    const now = Math.floor(Date.now() / 1000)
    set((state) => ({
      [kind]: state[kind].map((item) =>
        item.path === path || item.source === path
          ? { ...item, thumb, edited: Math.max(item.edited, thumb || 0, now) }
          : item,
      ),
    }))
  },
  setMeta: (kind, path, meta) => {
    const now = Math.floor(Date.now() / 1000)
    set((state) => ({
      [kind]: state[kind].map((item) =>
        item.path === path || item.source === path ? { ...item, ...meta, edited: Math.max(item.edited, now) } : item,
      ),
    }))
  },
}))

export function modelPath(item: unknown): string {
  if (typeof item === 'string') {
    return item
  }
  if (item && typeof item === 'object' && 'path' in item) {
    const path = (item as { path: unknown }).path
    if (typeof path === 'string') {
      return path
    }
  }
  return ''
}

export function modelLabel(id: unknown) {
  const path = modelPath(id)
  return path ? path.replace(/\.[^/.]+$/, '') : ''
}
