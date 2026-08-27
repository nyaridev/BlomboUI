import { create } from 'zustand'
import { dismissIssue, dismissIssueLog, getIssues, type GuiIssue } from '@/lib/api.ts'

export function isLoggedIssue(item: GuiIssue) {
  return item.id != null
}

function maxLogId(items: GuiIssue[], floor = 0) {
  return items.reduce((acc, item) => (item.id != null && item.id > acc ? item.id : acc), floor)
}

type IssuesState = {
  items: GuiIssue[]
  busy: boolean
  seenLogId: number
  load: () => Promise<GuiIssue[]>
  dismiss: (id: number) => Promise<void>
  dismissLog: () => Promise<void>
  markLogsSeen: () => void
}

export const useIssuesStore = create<IssuesState>((set, get) => ({
  items: [],
  busy: false,
  seenLogId: 0,
  load: async () => {
    set({ busy: true })
    try {
      const items = await getIssues()
      set({ items })
      return items
    } catch {
      return get().items
    } finally {
      set({ busy: false })
    }
  },
  dismiss: async (id) => {
    await dismissIssue(id)
    set({ items: get().items.filter((item) => item.id !== id) })
  },
  dismissLog: async () => {
    await dismissIssueLog()
    set({ items: get().items.filter((item) => item.id == null) })
  },
  markLogsSeen: () => {
    const seenLogId = maxLogId(get().items, get().seenLogId)
    if (seenLogId !== get().seenLogId) {
      set({ seenLogId })
    }
  },
}))
