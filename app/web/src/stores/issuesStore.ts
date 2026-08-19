import { create } from 'zustand'
import { getIssues, type GuiIssue } from '@/lib/api.ts'

type IssuesState = {
  items: GuiIssue[]
  busy: boolean
  load: () => Promise<GuiIssue[]>
}

export const useIssuesStore = create<IssuesState>((set, get) => ({
  items: [],
  busy: false,
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
}))
