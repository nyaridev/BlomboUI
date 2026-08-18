import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { type GenerateTab } from '@/screens/generate/tabs.ts'

export const useSettingsStore = create<{
  batchGrid: boolean
  batchGridMax: number
  batchGridQuality: number
  hiddenGenerateTabs: GenerateTab[]
  setBatchGrid: (value: boolean) => void
  setBatchGridMax: (value: number) => void
  setBatchGridQuality: (value: number) => void
  setHiddenGenerateTabs: (value: GenerateTab[]) => void
}>()(
  persist(
    (set) => ({
      batchGrid: true,
      batchGridMax: 16,
      batchGridQuality: 85,
      hiddenGenerateTabs: [],
      setBatchGrid: (batchGrid) => set({ batchGrid }),
      setBatchGridMax: (batchGridMax) => set({ batchGridMax }),
      setBatchGridQuality: (batchGridQuality) => set({ batchGridQuality }),
      setHiddenGenerateTabs: (hiddenGenerateTabs) =>
        set({ hiddenGenerateTabs: hiddenGenerateTabs.filter((item) => item !== 'Generation') }),
    }),
    { name: 'blombo-settings' },
  ),
)
