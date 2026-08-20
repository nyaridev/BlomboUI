export const MAIN_TABS = [
  { id: 'Generate', to: '/', label: 'Generate' },
  { id: 'File Info', to: '/file-info', label: 'File Info' },
  { id: 'Gallery', to: '/gallery', label: 'Gallery' },
  { id: 'Models', to: '/models', label: 'Models' },
  { id: 'Wildcard Manager', to: '/wildcards', label: 'Wildcard Manager' },
  { id: 'Errors', to: '/errors', label: 'Errors' },
  { id: 'Settings', to: '/settings', label: 'Settings' },
] as const

export const ORDERABLE_MAIN_TABS = ['Generate', 'File Info', 'Gallery', 'Models', 'Wildcard Manager'] as const
export const HIDEABLE_MAIN_TABS = ['Generate', 'File Info', 'Gallery', 'Models', 'Wildcard Manager', 'Errors'] as const

export type MainTabId = (typeof MAIN_TABS)[number]['id']
export type OrderableMainTab = (typeof ORDERABLE_MAIN_TABS)[number]
export type HideableMainTab = (typeof HIDEABLE_MAIN_TABS)[number]

export function mergeOrder<T extends string>(order: readonly string[], defaults: readonly T[]): T[] {
  const allowed = new Set(defaults)
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of order) {
    if (allowed.has(item as T) && !seen.has(item)) {
      out.push(item as T)
      seen.add(item)
    }
  }
  for (const item of defaults) {
    if (!seen.has(item)) {
      out.push(item)
    }
  }
  return out
}

export function mainTab(id: string) {
  return MAIN_TABS.find((item) => item.id === id)
}

export function mainTabByPath(path: string) {
  return MAIN_TABS.find((item) => item.to === path)
}

export function visibleLeftTabIds(order: readonly string[], hidden: readonly string[]): OrderableMainTab[] {
  return mergeOrder(order, ORDERABLE_MAIN_TABS).filter((id) => !hidden.includes(id))
}

export function visibleMainTabIds(order: readonly string[], hidden: readonly string[]): MainTabId[] {
  const left = visibleLeftTabIds(order, hidden)
  const right: MainTabId[] = []
  if (!hidden.includes('Errors')) {
    right.push('Errors')
  }
  right.push('Settings')
  return [...left, ...right]
}

export function firstVisiblePath(order: readonly string[], hidden: readonly string[]): string {
  const id = visibleMainTabIds(order, hidden)[0] ?? 'Settings'
  return mainTab(id)?.to ?? '/settings'
}

export function mainTabHidden(id: string, hidden: readonly string[]) {
  return id !== 'Settings' && hidden.includes(id)
}
