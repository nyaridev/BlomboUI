import { create } from 'zustand'
import {
  clearDownloads,
  listDownloads,
  removeDownload,
  retryDownload,
  type ActiveDownload,
  type DownloadItem,
  type QueuedDownload,
} from '@/lib/api/downloads.ts'

type DownloadsState = {
  items: DownloadItem[]
  active: ActiveDownload[]
  queued: QueuedDownload[]
  busy: boolean
  load: (opts?: { silent?: boolean }) => Promise<void>
  clear: () => Promise<void>
  remove: (id: number) => Promise<void>
  removeMany: (ids: number[]) => Promise<void>
  retry: (id: number) => Promise<void>
}

export const useDownloadsStore = create<DownloadsState>((set, get) => ({
  items: [],
  active: [],
  queued: [],
  busy: false,
  load: async (opts) => {
    const silent = Boolean(opts?.silent) || get().items.length > 0 || get().active.length > 0 || get().queued.length > 0
    if (!silent) {
      set({ busy: true })
    }
    try {
      const data = await listDownloads()
      set({ items: data.items, active: data.active, queued: data.queued })
    } catch {
      set({ items: get().items, active: get().active, queued: get().queued })
    } finally {
      set({ busy: false })
    }
  },
  clear: async () => {
    set({ busy: true })
    try {
      await clearDownloads()
      set({ items: [], active: [], queued: [] })
    } finally {
      set({ busy: false })
    }
  },
  remove: async (id) => {
    await removeDownload(id)
    set({ items: get().items.filter((item) => item.id !== id) })
  },
  removeMany: async (ids) => {
    if (!ids.length) {
      return
    }
    await Promise.all(ids.map((id) => removeDownload(id)))
    const gone = new Set(ids)
    set({ items: get().items.filter((item) => !gone.has(item.id)) })
  },
  retry: async (id) => {
    await retryDownload(id)
    await get().load({ silent: true })
  },
}))
