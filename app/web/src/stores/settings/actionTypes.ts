import type { SettingsState } from '../settingsStore.ts'

export type SettingsSet = (
  partial: Partial<SettingsState> | ((state: SettingsState) => Partial<SettingsState>),
) => void
