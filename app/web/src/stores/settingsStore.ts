import { create } from 'zustand'
import { getSettings, saveSettings, type UserSettings } from '@/lib/api.ts'
import { defaultHiddenModelTypes, MODEL_TYPES } from '@/lib/modelTypes.ts'
import { type GenerateTab } from '@/screens/generate/tabs.ts'

export const THEMES = [
  { value: 'darker', label: 'Default' },
  { value: 'slate', label: 'Slate' },
  { value: 'midnight', label: 'Midnight' },
  { value: 'ember', label: 'Ember' },
  { value: 'moss', label: 'Moss' },
  { value: 'light', label: 'Light' },
] as const

export type Theme = (typeof THEMES)[number]['value']

const THEME_IDS = new Set<string>(THEMES.map((item) => item.value))

export const CIVITAI_SITES = [
  { value: 'red', label: 'civitai.red' },
  { value: 'civitai', label: 'civitai.com' },
] as const

export type CivitaiSite = (typeof CIVITAI_SITES)[number]['value']

export function civitaiHost(site: CivitaiSite) {
  return site === 'civitai' ? 'civitai.com' : 'civitai.red'
}

export const GALLERY_VIEWS = ['checkpoints', 'loras', 'wildcards'] as const

export type GalleryViewKind = (typeof GALLERY_VIEWS)[number]
export type GallerySortKey = 'name' | 'added' | 'edited' | 'path'
export type GallerySortDir = 'asc' | 'desc'

const SORT_KEYS = new Set<string>(['name', 'added', 'edited', 'path'])

export const SETTINGS_DEFAULTS = {
  batchGrid: true,
  batchGridMax: 16,
  batchGridQuality: 85,
  batchGridRows: 0,
  batchGridFill: false,
  hiddenGenerateTabs: [] as GenerateTab[],
  hiddenModelTypes: defaultHiddenModelTypes(),
  theme: 'darker' as Theme,
  civitaiSite: 'red' as CivitaiSite,
  wildcardYamlByFilename: false,
  imagePath: '[workflow]/images/[date]',
  gridPath: '[workflow]/grids/[date]',
  gallerySortKey: {
    checkpoints: 'name',
    loras: 'name',
    wildcards: 'name',
  } as Record<GalleryViewKind, GallerySortKey>,
  gallerySortDir: {
    checkpoints: 'asc',
    loras: 'asc',
    wildcards: 'asc',
  } as Record<GalleryViewKind, GallerySortDir>,
  galleryTileScale: 1,
}

type SettingsState = typeof SETTINGS_DEFAULTS & {
  loaded: boolean
  load: () => Promise<void>
  setBatchGrid: (value: boolean) => void
  setBatchGridMax: (value: number) => void
  setBatchGridQuality: (value: number) => void
  setBatchGridRows: (value: number) => void
  setBatchGridFill: (value: boolean) => void
  setHiddenGenerateTabs: (value: GenerateTab[]) => void
  setHiddenModelTypes: (value: string[]) => void
  setTheme: (value: Theme) => void
  setCivitaiSite: (value: CivitaiSite) => void
  setWildcardYamlByFilename: (value: boolean) => void
  setImagePath: (value: string) => void
  setGridPath: (value: string) => void
  setGallerySortKey: (kind: GalleryViewKind, value: GallerySortKey) => void
  setGallerySortDir: (kind: GalleryViewKind, value: GallerySortDir) => void
  setGalleryTileScale: (value: number) => void
}

const KEYS = [
  'batchGrid',
  'batchGridMax',
  'batchGridQuality',
  'batchGridRows',
  'batchGridFill',
  'hiddenGenerateTabs',
  'hiddenModelTypes',
  'theme',
  'civitaiSite',
  'wildcardYamlByFilename',
  'imagePath',
  'gridPath',
  'gallerySortKey',
  'gallerySortDir',
  'galleryTileScale',
] as const

function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function cleanTabs(raw: unknown): GenerateTab[] {
  if (!Array.isArray(raw)) {
    return SETTINGS_DEFAULTS.hiddenGenerateTabs
  }
  const out: GenerateTab[] = []
  for (const item of raw) {
    const name = (item === 'Checkpoints' ? 'Base Model' : String(item)) as GenerateTab
    if (name && name !== 'Generation' && !out.includes(name)) {
      out.push(name)
    }
  }
  return out
}

function cleanTypes(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return SETTINGS_DEFAULTS.hiddenModelTypes
  }
  const allowed = new Set(MODEL_TYPES)
  const out: string[] = []
  for (const item of raw) {
    const name = String(item)
    if (name && allowed.has(name) && !out.includes(name)) {
      out.push(name)
    }
  }
  return out
}

function cleanTheme(raw: unknown): Theme {
  const name = raw === 'default' ? 'slate' : raw
  return THEME_IDS.has(name as string) ? (name as Theme) : SETTINGS_DEFAULTS.theme
}

function cleanCivitaiSite(raw: unknown): CivitaiSite {
  return raw === 'civitai' ? 'civitai' : SETTINGS_DEFAULTS.civitaiSite
}

function cleanPath(raw: unknown, fallback: string) {
  if (typeof raw !== 'string') {
    return fallback
  }
  const text = raw.trim().replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
  if (!text) {
    return fallback
  }
  return text
}

function cleanSortKey(raw: unknown): GallerySortKey {
  return SORT_KEYS.has(raw as string) ? (raw as GallerySortKey) : 'name'
}

function cleanSortDir(raw: unknown): GallerySortDir {
  return raw === 'desc' ? 'desc' : 'asc'
}

function cleanSortKeyMap(raw: unknown): Record<GalleryViewKind, GallerySortKey> {
  const fallback = SETTINGS_DEFAULTS.gallerySortKey
  if (typeof raw === 'string') {
    const value = cleanSortKey(raw)
    return { checkpoints: value, loras: value, wildcards: value }
  }
  if (!raw || typeof raw !== 'object') {
    return fallback
  }
  const row = raw as Record<string, unknown>
  return {
    checkpoints: cleanSortKey(row.checkpoints ?? fallback.checkpoints),
    loras: cleanSortKey(row.loras ?? fallback.loras),
    wildcards: cleanSortKey(row.wildcards ?? fallback.wildcards),
  }
}

function cleanSortDirMap(raw: unknown): Record<GalleryViewKind, GallerySortDir> {
  const fallback = SETTINGS_DEFAULTS.gallerySortDir
  if (typeof raw === 'string') {
    const value = cleanSortDir(raw)
    return { checkpoints: value, loras: value, wildcards: value }
  }
  if (!raw || typeof raw !== 'object') {
    return fallback
  }
  const row = raw as Record<string, unknown>
  return {
    checkpoints: cleanSortDir(row.checkpoints ?? fallback.checkpoints),
    loras: cleanSortDir(row.loras ?? fallback.loras),
    wildcards: cleanSortDir(row.wildcards ?? fallback.wildcards),
  }
}

function cleanTileScale(raw: unknown) {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) {
    return SETTINGS_DEFAULTS.galleryTileScale
  }
  return Math.round(Math.min(2, Math.max(0.5, n)) * 10) / 10
}

function applyPatch(patch: UserSettings): typeof SETTINGS_DEFAULTS {
  return {
    batchGrid: typeof patch.batchGrid === 'boolean' ? patch.batchGrid : SETTINGS_DEFAULTS.batchGrid,
    batchGridMax: typeof patch.batchGridMax === 'number' ? patch.batchGridMax : SETTINGS_DEFAULTS.batchGridMax,
    batchGridQuality: typeof patch.batchGridQuality === 'number' ? patch.batchGridQuality : SETTINGS_DEFAULTS.batchGridQuality,
    batchGridRows: typeof patch.batchGridRows === 'number' ? patch.batchGridRows : SETTINGS_DEFAULTS.batchGridRows,
    batchGridFill: typeof patch.batchGridFill === 'boolean' ? patch.batchGridFill : SETTINGS_DEFAULTS.batchGridFill,
    hiddenGenerateTabs: patch.hiddenGenerateTabs ? cleanTabs(patch.hiddenGenerateTabs) : SETTINGS_DEFAULTS.hiddenGenerateTabs,
    hiddenModelTypes: patch.hiddenModelTypes ? cleanTypes(patch.hiddenModelTypes) : SETTINGS_DEFAULTS.hiddenModelTypes,
    theme: patch.theme ? cleanTheme(patch.theme) : SETTINGS_DEFAULTS.theme,
    civitaiSite: patch.civitaiSite ? cleanCivitaiSite(patch.civitaiSite) : SETTINGS_DEFAULTS.civitaiSite,
    wildcardYamlByFilename:
      typeof patch.wildcardYamlByFilename === 'boolean'
        ? patch.wildcardYamlByFilename
        : SETTINGS_DEFAULTS.wildcardYamlByFilename,
    imagePath: cleanPath(patch.imagePath, SETTINGS_DEFAULTS.imagePath),
    gridPath: cleanPath(patch.gridPath, SETTINGS_DEFAULTS.gridPath),
    gallerySortKey: patch.gallerySortKey ? cleanSortKeyMap(patch.gallerySortKey) : SETTINGS_DEFAULTS.gallerySortKey,
    gallerySortDir: patch.gallerySortDir ? cleanSortDirMap(patch.gallerySortDir) : SETTINGS_DEFAULTS.gallerySortDir,
    galleryTileScale:
      typeof patch.galleryTileScale === 'number' ? cleanTileScale(patch.galleryTileScale) : SETTINGS_DEFAULTS.galleryTileScale,
  }
}

function diff(state: typeof SETTINGS_DEFAULTS): UserSettings {
  const out: UserSettings = {}
  for (const key of KEYS) {
    if (!same(state[key], SETTINGS_DEFAULTS[key])) {
      Object.assign(out, { [key]: state[key] })
    }
  }
  return out
}

function pickLegacy(raw: unknown): UserSettings {
  if (!raw || typeof raw !== 'object') {
    return {}
  }
  const row = raw as Record<string, unknown>
  const state = row.state && typeof row.state === 'object' ? (row.state as Record<string, unknown>) : row
  const patch: UserSettings = {}
  if (typeof state.batchGrid === 'boolean') {
    patch.batchGrid = state.batchGrid
  }
  if (typeof state.batchGridMax === 'number') {
    patch.batchGridMax = state.batchGridMax
  }
  if (typeof state.batchGridQuality === 'number') {
    patch.batchGridQuality = state.batchGridQuality
  }
  if (typeof state.batchGridRows === 'number') {
    patch.batchGridRows = state.batchGridRows
  }
  if (typeof state.batchGridFill === 'boolean') {
    patch.batchGridFill = state.batchGridFill
  }
  if (Array.isArray(state.hiddenGenerateTabs)) {
    patch.hiddenGenerateTabs = state.hiddenGenerateTabs as string[]
  }
  if (Array.isArray(state.hiddenModelTypes)) {
    patch.hiddenModelTypes = state.hiddenModelTypes as string[]
  }
  if (typeof state.theme === 'string') {
    patch.theme = state.theme
  }
  if (typeof state.civitaiSite === 'string') {
    patch.civitaiSite = state.civitaiSite
  }
  if (typeof state.wildcardYamlByFilename === 'boolean') {
    patch.wildcardYamlByFilename = state.wildcardYamlByFilename
  }
  if (typeof state.imagePath === 'string') {
    patch.imagePath = state.imagePath
  }
  if (typeof state.gridPath === 'string') {
    patch.gridPath = state.gridPath
  }
  if (typeof state.gallerySortKey === 'string' || (state.gallerySortKey && typeof state.gallerySortKey === 'object')) {
    patch.gallerySortKey = state.gallerySortKey as UserSettings['gallerySortKey']
  }
  if (typeof state.gallerySortDir === 'string' || (state.gallerySortDir && typeof state.gallerySortDir === 'object')) {
    patch.gallerySortDir = state.gallerySortDir as UserSettings['gallerySortDir']
  }
  if (typeof state.galleryTileScale === 'number') {
    patch.galleryTileScale = state.galleryTileScale
  }
  return patch
}

let timer = 0

function flush() {
  const state = useSettingsStore.getState()
  if (!state.loaded) {
    return
  }
  void saveSettings(diff(state)).catch(() => {})
}

function persist() {
  window.clearTimeout(timer)
  timer = window.setTimeout(flush, 200)
}

export const useSettingsStore = create<SettingsState>((set) => ({
  ...SETTINGS_DEFAULTS,
  loaded: false,
  load: async () => {
    let patch: UserSettings = {}
    try {
      patch = await getSettings()
    } catch {
      patch = {}
    }
    if (Object.keys(patch).length === 0) {
      const raw = localStorage.getItem('blombo-settings')
      if (raw) {
        try {
          patch = pickLegacy(JSON.parse(raw) as unknown)
        } catch {
          patch = {}
        }
        localStorage.removeItem('blombo-settings')
        const next = applyPatch(patch)
        set({ ...next, loaded: true })
        void saveSettings(diff(next)).catch(() => {})
        return
      }
    }
    set({ ...applyPatch(patch), loaded: true })
  },
  setBatchGrid: (batchGrid) => {
    set({ batchGrid })
    persist()
  },
  setBatchGridMax: (batchGridMax) => {
    set({ batchGridMax })
    persist()
  },
  setBatchGridQuality: (batchGridQuality) => {
    set({ batchGridQuality })
    persist()
  },
  setBatchGridRows: (batchGridRows) => {
    set({ batchGridRows })
    persist()
  },
  setBatchGridFill: (batchGridFill) => {
    set({ batchGridFill })
    persist()
  },
  setHiddenGenerateTabs: (hiddenGenerateTabs) => {
    set({ hiddenGenerateTabs: hiddenGenerateTabs.filter((item) => item !== 'Generation') })
    persist()
  },
  setHiddenModelTypes: (hiddenModelTypes) => {
    set({ hiddenModelTypes })
    persist()
  },
  setTheme: (theme) => {
    set({ theme: cleanTheme(theme) })
    persist()
  },
  setCivitaiSite: (civitaiSite) => {
    set({ civitaiSite: cleanCivitaiSite(civitaiSite) })
    persist()
  },
  setWildcardYamlByFilename: (wildcardYamlByFilename) => {
    set({ wildcardYamlByFilename })
    persist()
  },
  setImagePath: (imagePath) => {
    set({ imagePath })
    persist()
  },
  setGridPath: (gridPath) => {
    set({ gridPath })
    persist()
  },
  setGallerySortKey: (kind, gallerySortKey) => {
    set((state) => ({
      gallerySortKey: { ...state.gallerySortKey, [kind]: cleanSortKey(gallerySortKey) },
    }))
    persist()
  },
  setGallerySortDir: (kind, gallerySortDir) => {
    set((state) => ({
      gallerySortDir: { ...state.gallerySortDir, [kind]: cleanSortDir(gallerySortDir) },
    }))
    persist()
  },
  setGalleryTileScale: (galleryTileScale) => {
    set({ galleryTileScale: cleanTileScale(galleryTileScale) })
    persist()
  },
}))
