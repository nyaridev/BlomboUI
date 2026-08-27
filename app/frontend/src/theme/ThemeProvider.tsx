import { useEffect, type ReactNode } from 'react'
import { useSettingsStore } from '@/stores/settingsStore.ts'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSettingsStore((s) => s.theme)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  return children
}
