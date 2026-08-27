import { defaultCivitaiMarks } from '@/lib/civitai/marks.ts'
import { AUTOCOMPLETE_LIST_DEFAULT, autocompleteListRule, SETTINGS_DEFAULTS } from './constants.ts'

export type SettingsKey = keyof typeof SETTINGS_DEFAULTS
type SettingsValues = typeof SETTINGS_DEFAULTS

const EMPTY_MARK = { text: '' }

function fieldOf(value: unknown, field: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  return (value as Record<string, unknown>)[field]
}

export function settingDefault(key: SettingsKey, field?: string): unknown {
  if (field === undefined) {
    return SETTINGS_DEFAULTS[key]
  }
  if (key === 'autocompleteLists') {
    return AUTOCOMPLETE_LIST_DEFAULT
  }
  if (key === 'civitaiMarks') {
    return SETTINGS_DEFAULTS.civitaiMarks[field] ?? EMPTY_MARK
  }
  return fieldOf(SETTINGS_DEFAULTS[key], field)
}

export function settingCurrent(state: SettingsValues, key: SettingsKey, field?: string): unknown {
  if (field === undefined) {
    return state[key]
  }
  if (key === 'autocompleteLists') {
    return autocompleteListRule(state.autocompleteLists, field)
  }
  if (key === 'civitaiMarks') {
    return state.civitaiMarks[field] ?? defaultCivitaiMarks()[field] ?? EMPTY_MARK
  }
  return fieldOf(state[key], field)
}

export function applySettingReset(state: SettingsValues, key: SettingsKey, field?: string): Partial<SettingsValues> {
  if (field === undefined) {
    return { [key]: structuredClone(SETTINGS_DEFAULTS[key]) } as Partial<SettingsValues>
  }
  if (key === 'autocompleteLists') {
    const autocompleteLists = { ...state.autocompleteLists }
    delete autocompleteLists[field]
    return { autocompleteLists }
  }
  if (key === 'civitaiMarks') {
    const civitaiMarks = { ...state.civitaiMarks }
    const def = SETTINGS_DEFAULTS.civitaiMarks[field]
    if (def) {
      civitaiMarks[field] = structuredClone(def)
    } else {
      delete civitaiMarks[field]
    }
    return { civitaiMarks }
  }
  const current = state[key]
  const fallback = fieldOf(SETTINGS_DEFAULTS[key], field)
  if (current && typeof current === 'object' && !Array.isArray(current) && fallback !== undefined) {
    return { [key]: { ...(current as object), [field]: structuredClone(fallback) } } as Partial<SettingsValues>
  }
  return {}
}
