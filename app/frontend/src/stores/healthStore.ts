import { create } from 'zustand'
import { getHealth, type Health } from '@/lib/api.ts'

type Status = 'idle' | 'loading' | 'ok' | 'error'

type HealthState = {
  status: Status
  health: Health | null
  error: string | null
  refresh: () => Promise<void>
}

export const useHealthStore = create<HealthState>((set) => ({
  status: 'idle',
  health: null,
  error: null,
  refresh: async () => {
    set({ status: 'loading', error: null })
    try {
      const health = await getHealth()
      set({ status: health.ok ? 'ok' : 'error', health })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unreachable'
      set({ status: 'error', health: null, error: message })
    }
  },
}))
