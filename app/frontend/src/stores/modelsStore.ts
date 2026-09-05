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
  diffusion_models: [],
  text_encoders: [],
  upscale_models: [],
  sams: [],
  ultralytics: [],
  wildcards: [],
}

type ModelsState = ModelLists & {
  busy: boolean
  loaded: boolean
  treeEpoch: number
  load: () => Promise<void>
  pull: () => Promise<void>
  refresh: (opts?: { silent?: boolean }) => Promise<void>
  refreshKind: (kind: keyof ModelLists) => Promise<void>
  relocate: (kind: keyof ModelLists, from: string, to: string) => void
  removeIdent: (kind: keyof ModelLists, ident: string) => void
  bumpTree: () => void
  setThumb: (kind: keyof ModelLists, path: string, thumb: number) => void
  setMeta: (
    kind: keyof ModelLists,
    path: string,
    meta: {
      prompt?: string
      negative_prompt?: string
      notes?: string
      strength?: number
      slider?: boolean
      auto_apply?: boolean | null
      apply_at?: 'start' | 'end' | null
    },
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
        thumb_media: typeof row.thumb_media === 'string' ? row.thumb_media : '',
        thumb_global: Number(row.thumb_global) || 0,
        thumb_global_media: typeof row.thumb_global_media === 'string' ? row.thumb_global_media : '',
        thumb_exact: Number(row.thumb_exact) || 0,
        thumb_exact_media: typeof row.thumb_exact_media === 'string' ? row.thumb_exact_media : '',
        thumb_any: Number(row.thumb_any) || 0,
        hashes:
          row.hashes && typeof row.hashes === 'object'
            ? {
                sha256: typeof row.hashes.sha256 === 'string' ? row.hashes.sha256 : '',
                autov1: typeof row.hashes.autov1 === 'string' ? row.hashes.autov1 : '',
                autov2: typeof row.hashes.autov2 === 'string' ? row.hashes.autov2 : '',
                autov3: typeof row.hashes.autov3 === 'string' ? row.hashes.autov3 : '',
              }
            : undefined,
        hashing: Boolean(row.hashing),
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
        types: Array.isArray(row.types)
          ? row.types.filter((item): item is string => typeof item === 'string' && Boolean(item))
          : [],
        auto_apply: typeof row.auto_apply === 'boolean' ? row.auto_apply : null,
        apply_at: row.apply_at === 'start' || row.apply_at === 'end' ? row.apply_at : null,
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
    diffusion_models: asList(lists.diffusion_models),
    text_encoders: asList(lists.text_encoders),
    upscale_models: asList(lists.upscale_models),
    sams: asList(lists.sams),
    ultralytics: asList(lists.ultralytics),
    wildcards: asList(lists.wildcards),
  }
}

function notifyIssues() {
  void useIssuesStore.getState().load().then((items) => toastIssues(items))
}

function coversIdent(value: string, ident: string) {
  return value === ident || value.startsWith(`${ident}/`) || value.startsWith(`${ident}#`)
}

function remapIdent(value: string, from: string, to: string) {
  if (!value || !from) {
    return value
  }
  if (value === from) {
    return to
  }
  if (value.startsWith(`${from}/`) || value.startsWith(`${from}#`)) {
    return to + value.slice(from.length)
  }
  return value
}

function relocateList(items: ModelEntry[], from: string, to: string) {
  return items.map((item) => {
    const path = remapIdent(item.path, from, to)
    const source = item.source ? remapIdent(item.source, from, to) : item.source
    if (path === item.path && source === item.source) {
      return item
    }
    return { ...item, path, source: source || item.source }
  })
}

function dropIdent(items: ModelEntry[], ident: string) {
  return items.filter((item) => !coversIdent(item.path, ident) && !coversIdent(item.source || '', ident))
}

let inflight: Promise<void> | null = null

export const useModelsStore = create<ModelsState>((set, get) => ({
  ...EMPTY,
  busy: false,
  loaded: false,
  treeEpoch: 0,
  load: async () => {
    if (get().loaded) {
      return
    }
    if (inflight) {
      await inflight
      return
    }
    set({ busy: true })
    inflight = (async () => {
      try {
        set({ ...apply(await getModels()), loaded: true })
      } catch {
        /* keep current */
      } finally {
        inflight = null
        set({ busy: false })
        void notifyIssues()
      }
    })()
    await inflight
  },
  pull: async () => {
    if (inflight) {
      await inflight
      return
    }
    inflight = (async () => {
      try {
        set({ ...apply(await getModels()), loaded: true })
      } catch {
        /* keep current */
      } finally {
        inflight = null
      }
    })()
    await inflight
  },
  refresh: async (opts) => {
    if (get().busy) {
      return
    }
    set({ busy: true })
    try {
      set({ ...apply(await refreshModels()), loaded: true, treeEpoch: get().treeEpoch + 1 })
      if (!opts?.silent) {
        toast('Models reloaded', 'ok')
      }
    } catch {
      try {
        set({ ...apply(await getModels()), loaded: true, treeEpoch: get().treeEpoch + 1 })
        if (!opts?.silent) {
          toast('Models reloaded', 'ok')
        }
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
      set({ [kind]: asList(lists[kind]), loaded: true, treeEpoch: get().treeEpoch + 1 })
      toast('Models reloaded', 'ok')
    } catch {
      try {
        const lists = await getModels()
        set({ [kind]: asList(lists[kind]), loaded: true, treeEpoch: get().treeEpoch + 1 })
        toast('Models reloaded', 'ok')
      } catch {
        /* keep current */
      }
    } finally {
      set({ busy: false })
      void notifyIssues()
    }
  },
  relocate: (kind, from, to) => {
    if (!from || from === to) {
      return
    }
    set((state) => ({
      [kind]: relocateList(state[kind], from, to),
      treeEpoch: state.treeEpoch + 1,
    }))
  },
  removeIdent: (kind, ident) => {
    if (!ident) {
      return
    }
    set((state) => ({
      [kind]: dropIdent(state[kind], ident),
      treeEpoch: state.treeEpoch + 1,
    }))
  },
  bumpTree: () => {
    set((state) => ({ treeEpoch: state.treeEpoch + 1 }))
  },
  setThumb: (kind, path, thumb) => {
    const now = Math.floor(Date.now() / 1000)
    set((state) => ({
      [kind]: state[kind].map((item) =>
        item.path === path
          ? { ...item, thumb, thumb_any: Math.max(item.thumb_any || 0, thumb || 0), edited: Math.max(item.edited, thumb || 0, now) }
          : item,
      ),
    }))
  },
  setMeta: (kind, path, meta) => {
    const now = Math.floor(Date.now() / 1000)
    const file = path.split('#')[0]
    set((state) => ({
      [kind]: state[kind].map((item) =>
        item.path === path || item.source === path || (item.source || item.path.split('#')[0]) === file
          ? { ...item, ...meta, edited: Math.max(item.edited, now) }
          : item,
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
  if (!path) {
    return ''
  }
  const base = path.replace(/\\/g, '/').split('/').pop() || path
  return base.replace(/\.[^/.]+$/, '')
}
