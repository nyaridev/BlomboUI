import { create } from 'zustand'
import { type GuiIssue } from '@/lib/api.ts'

export type ToastTone = 'ok' | 'info' | 'error'

export type Toast = {
  id: number
  text: string
  tone: ToastTone
  dead?: boolean
  progress?: number | null
  onCancel?: () => void
}

const ISSUE_LABEL: Record<string, string> = {
  duplicate_name: 'Duplicate name',
  duplicate_tag: 'Duplicate header',
  invalid_file: 'Invalid file',
  duplicate_dir: 'Duplicate directory',
  missing_dir: 'Missing directory',
  download_failed: 'Download failed',
}

let seq = 0

type ToastState = {
  items: Toast[]
  push: (text: string, tone?: ToastTone) => void
  pushSticky: (text: string, tone?: ToastTone, opts?: { onCancel?: () => void }) => number
  update: (id: number, patch: { text?: string; progress?: number | null; tone?: ToastTone }) => void
  finish: (id: number, text: string, tone?: ToastTone) => void
  dismiss: (id: number) => void
}

export const useToastStore = create<ToastState>((set, get) => ({
  items: [],
  push: (text, tone = 'info') => {
    const id = ++seq
    set({ items: [{ id, text, tone }, ...get().items] })
    window.setTimeout(() => get().dismiss(id), 3000)
  },
  pushSticky: (text, tone = 'info', opts) => {
    const id = ++seq
    set({ items: [{ id, text, tone, progress: 0, onCancel: opts?.onCancel }, ...get().items] })
    return id
  },
  update: (id, patch) => {
    const row = get().items.find((item) => item.id === id)
    if (!row || row.dead) {
      return
    }
    set({
      items: get().items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    })
  },
  finish: (id, text, tone = 'info') => {
    const row = get().items.find((item) => item.id === id)
    if (!row || row.dead) {
      return
    }
    set({
      items: get().items.map((item) =>
        item.id === id ? { id, text, tone, progress: null, onCancel: undefined } : item,
      ),
    })
    window.setTimeout(() => get().dismiss(id), 3000)
  },
  dismiss: (id) => {
    const row = get().items.find((item) => item.id === id)
    if (!row || row.dead) {
      return
    }
    set({ items: get().items.map((item) => (item.id === id ? { ...item, dead: true } : item)) })
    window.setTimeout(() => {
      set({ items: get().items.filter((item) => item.id !== id) })
    }, 180)
  },
}))

export function toast(text: string, tone: ToastTone = 'info') {
  useToastStore.getState().push(text, tone)
}

export function toastIssues(items: GuiIssue[]) {
  for (const item of items) {
    if (item.id != null) {
      continue
    }
    const label = ISSUE_LABEL[item.code] || item.code
    toast(`${label}: ${item.name}`, 'error')
  }
}
