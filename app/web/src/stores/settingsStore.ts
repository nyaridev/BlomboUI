import { create } from 'zustand'
import { getSettings, saveSettings, type FolderDir, type UserSettings } from '@/lib/api.ts'
import { LOCAL_ID, OUTPUT_ID } from '@/components/FolderList.tsx'
import { defaultHiddenModelTypes, MODEL_TYPES } from '@/lib/modelTypes.ts'
import { GENERATE_TABS, generateTabOrderList, type GenerateTab } from '@/screens/generate/tabs.ts'
import {
  HIDEABLE_MAIN_TABS,
  mergeOrder,
  ORDERABLE_MAIN_TABS,
  type HideableMainTab,
  type OrderableMainTab,
} from '@/app/appTabs.ts'
import { type TimeDisplay } from '@/lib/timeDisplay.ts'

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

export const TIME_DISPLAYS = [
  { value: 'full', label: 'Full time' },
  { value: 'ampm', label: 'AM/PM' },
] as const

export type { TimeDisplay }

export function civitaiHost(site: CivitaiSite) {
  return site === 'civitai' ? 'civitai.com' : 'civitai.red'
}

export const GALLERY_VIEWS = ['checkpoints', 'loras', 'wildcards'] as const

export type GalleryViewKind = (typeof GALLERY_VIEWS)[number]
export type GallerySortKey = 'name' | 'added' | 'edited' | 'path'
export type GallerySortDir = 'asc' | 'desc'

const SORT_KEYS = new Set<string>(['name', 'added', 'edited', 'path'])

export const IMAGE_FORMATS = [
  { value: 'png', label: 'PNG' },
  { value: 'jpg', label: 'JPEG' },
  { value: 'webp', label: 'WebP' },
] as const

export type ImageFormat = (typeof IMAGE_FORMATS)[number]['value']

const IMAGE_FORMAT_IDS = new Set<string>(IMAGE_FORMATS.map((item) => item.value))

export const SETTINGS_DEFAULTS = {
  batchGrid: true,
  batchGridMax: 16,
  batchGridQuality: 85,
  batchGridRows: 0,
  batchGridFill: false,
  batchGridOnCancel: true,
  saveInterrupted: true,
  interruptedInGrid: false,
  galleryHideInterrupted: true,
  hiddenGenerateTabs: [] as GenerateTab[],
  hiddenMainTabs: [] as HideableMainTab[],
  mainTabOrder: [...ORDERABLE_MAIN_TABS] as OrderableMainTab[],
  generateTabOrder: [...GENERATE_TABS] as GenerateTab[],
  mainTabKeysFollowLayout: true,
  generateTabKeysFollowLayout: true,
  hiddenModelTypes: defaultHiddenModelTypes(),
  hiddenSamplers: [] as string[],
  hiddenSchedulers: [] as string[],
  theme: 'darker' as Theme,
  civitaiSite: 'red' as CivitaiSite,
  timeDisplay: 'full' as TimeDisplay,
  wildcardYamlByFilename: false,
  imagePath: '[workflow]/images/[date]',
  gridPath: '[workflow]/grids/[date]',
  interruptedPath: '[workflow]/interrupted/[date]',
  imageName: 'blombo_[number]',
  gridName: 'blombo_[number]',
  imageFormat: 'png' as ImageFormat,
  imageQuality: 100,
  saveLargeAsJpeg: false,
  largeJpegMaxKb: 4096,
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
  galleryParentOnUnselect: true,
  promptWeightStep: 0.1,
  loraStrengthMin: 0,
  loraStrengthMax: 1,
  loraSliderMin: -5,
  loraSliderMax: 5,
  modelDirs: [{ id: LOCAL_ID, name: 'Local', path: '' }] as FolderDir[],
  wildcardDirs: [{ id: LOCAL_ID, name: 'Local', path: '' }] as FolderDir[],
  galleryDirs: [] as FolderDir[],
  forceDownloadModelsLocal: true,
  forceDownloadWildcardsLocal: true,
  removedAfterHours: 48,
  removedMaxGb: 100,
}

type SettingsState = typeof SETTINGS_DEFAULTS & {
  loaded: boolean
  load: () => Promise<void>
  setBatchGrid: (value: boolean) => void
  setBatchGridMax: (value: number) => void
  setBatchGridQuality: (value: number) => void
  setBatchGridRows: (value: number) => void
  setBatchGridFill: (value: boolean) => void
  setBatchGridOnCancel: (value: boolean) => void
  setSaveInterrupted: (value: boolean) => void
  setInterruptedInGrid: (value: boolean) => void
  setGalleryHideInterrupted: (value: boolean) => void
  setHiddenGenerateTabs: (value: GenerateTab[]) => void
  setHiddenMainTabs: (value: HideableMainTab[]) => void
  setMainTabOrder: (value: OrderableMainTab[]) => void
  setGenerateTabOrder: (value: GenerateTab[]) => void
  setMainTabKeysFollowLayout: (value: boolean) => void
  setGenerateTabKeysFollowLayout: (value: boolean) => void
  setHiddenModelTypes: (value: string[]) => void
  setHiddenSamplers: (value: string[]) => void
  setHiddenSchedulers: (value: string[]) => void
  setTheme: (value: Theme) => void
  setCivitaiSite: (value: CivitaiSite) => void
  setTimeDisplay: (value: TimeDisplay) => void
  setWildcardYamlByFilename: (value: boolean) => void
  setImagePath: (value: string) => void
  setGridPath: (value: string) => void
  setInterruptedPath: (value: string) => void
  setImageName: (value: string) => void
  setGridName: (value: string) => void
  setImageFormat: (value: ImageFormat) => void
  setImageQuality: (value: number) => void
  setSaveLargeAsJpeg: (value: boolean) => void
  setLargeJpegMaxKb: (value: number) => void
  setGallerySortKey: (kind: GalleryViewKind, value: GallerySortKey) => void
  setGallerySortDir: (kind: GalleryViewKind, value: GallerySortDir) => void
  setGalleryTileScale: (value: number) => void
  setGalleryParentOnUnselect: (value: boolean) => void
  setPromptWeightStep: (value: number) => void
  setLoraStrengthMin: (value: number) => void
  setLoraStrengthMax: (value: number) => void
  setLoraSliderMin: (value: number) => void
  setLoraSliderMax: (value: number) => void
  setModelDirs: (value: FolderDir[]) => void
  setWildcardDirs: (value: FolderDir[]) => void
  setGalleryDirs: (value: FolderDir[]) => void
  setForceDownloadModelsLocal: (value: boolean) => void
  setForceDownloadWildcardsLocal: (value: boolean) => void
  setRemovedAfterHours: (value: number) => void
  setRemovedMaxGb: (value: number) => void
}

const KEYS = [
  'batchGrid',
  'batchGridMax',
  'batchGridQuality',
  'batchGridRows',
  'batchGridFill',
  'batchGridOnCancel',
  'saveInterrupted',
  'interruptedInGrid',
  'galleryHideInterrupted',
  'hiddenGenerateTabs',
  'hiddenMainTabs',
  'mainTabOrder',
  'generateTabOrder',
  'mainTabKeysFollowLayout',
  'generateTabKeysFollowLayout',
  'hiddenModelTypes',
  'hiddenSamplers',
  'hiddenSchedulers',
  'theme',
  'civitaiSite',
  'timeDisplay',
  'wildcardYamlByFilename',
  'imagePath',
  'gridPath',
  'interruptedPath',
  'imageName',
  'gridName',
  'imageFormat',
  'imageQuality',
  'saveLargeAsJpeg',
  'largeJpegMaxKb',
  'gallerySortKey',
  'gallerySortDir',
  'galleryTileScale',
  'galleryParentOnUnselect',
  'promptWeightStep',
  'loraStrengthMin',
  'loraStrengthMax',
  'loraSliderMin',
  'loraSliderMax',
  'modelDirs',
  'wildcardDirs',
  'galleryDirs',
  'forceDownloadModelsLocal',
  'forceDownloadWildcardsLocal',
  'removedAfterHours',
  'removedMaxGb',
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

function cleanHiddenMainTabs(raw: unknown): HideableMainTab[] {
  if (!Array.isArray(raw)) {
    return SETTINGS_DEFAULTS.hiddenMainTabs
  }
  const allowed = new Set<string>(HIDEABLE_MAIN_TABS)
  const out: HideableMainTab[] = []
  for (const item of raw) {
    const name = String(item)
    if (allowed.has(name) && !out.includes(name as HideableMainTab)) {
      out.push(name as HideableMainTab)
    }
  }
  return out
}

function cleanMainTabOrder(raw: unknown): OrderableMainTab[] {
  if (!Array.isArray(raw)) {
    return SETTINGS_DEFAULTS.mainTabOrder
  }
  return mergeOrder(raw.map(String), ORDERABLE_MAIN_TABS)
}

function cleanGenerateTabOrder(raw: unknown): GenerateTab[] {
  if (!Array.isArray(raw)) {
    return SETTINGS_DEFAULTS.generateTabOrder
  }
  return generateTabOrderList(raw.map(String))
}

function cleanNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const out: string[] = []
  for (const item of raw) {
    const name = String(item).trim()
    if (name && !out.includes(name)) {
      out.push(name)
    }
  }
  return out
}

function cleanImageFormat(raw: unknown): ImageFormat {
  const name = raw === 'jpeg' ? 'jpg' : raw
  return IMAGE_FORMAT_IDS.has(name as string) ? (name as ImageFormat) : SETTINGS_DEFAULTS.imageFormat
}

function cleanImageQuality(raw: unknown) {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) {
    return SETTINGS_DEFAULTS.imageQuality
  }
  return Math.max(1, Math.min(100, Math.round(n)))
}

function cleanLargeJpegMaxKb(raw: unknown) {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) {
    return SETTINGS_DEFAULTS.largeJpegMaxKb
  }
  return Math.max(256, Math.min(65536, Math.round(n)))
}

function cleanRemovedHours(raw: unknown) {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) {
    return SETTINGS_DEFAULTS.removedAfterHours
  }
  return Math.max(1, Math.min(8760, Math.round(n)))
}

function cleanRemovedMaxGb(raw: unknown) {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) {
    return SETTINGS_DEFAULTS.removedMaxGb
  }
  return Math.max(1, Math.min(10000, Math.round(n)))
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

function cleanTimeDisplay(raw: unknown): TimeDisplay {
  return raw === 'ampm' ? 'ampm' : SETTINGS_DEFAULTS.timeDisplay
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

function cleanName(raw: unknown, fallback: string) {
  if (typeof raw !== 'string') {
    return fallback
  }
  const text = raw.trim().replaceAll('\\', '/').split('/').pop() ?? ''
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

function cleanPromptWeightStep(raw: unknown) {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) {
    return SETTINGS_DEFAULTS.promptWeightStep
  }
  return Math.round(Math.min(1, Math.max(0.01, n)) * 100) / 100
}

function cleanLoraBound(raw: unknown, fallback: number) {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) {
    return fallback
  }
  return Math.round(Math.min(20, Math.max(-20, n)) * 100) / 100
}

function cleanDirs(raw: unknown): FolderDir[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const out: FolderDir[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const row = item as FolderDir
    const id = String(row.id || '').trim().slice(0, 80)
    const name = String(row.name || '').trim().slice(0, 40)
    const path = String(row.path || '').trim().slice(0, 500)
    if (!id || !name || seen.has(id)) {
      continue
    }
    if (name.includes('/') || name.includes('\\')) {
      continue
    }
    seen.add(id)
    out.push({ id, name: id === LOCAL_ID ? 'Local' : name, path: id === LOCAL_ID ? '' : path })
  }
  return out
}

function ensureLocal(items: FolderDir[]): FolderDir[] {
  const extras = items.filter((item) => item.id !== LOCAL_ID)
  const index = items.findIndex((item) => item.id === LOCAL_ID)
  const local: FolderDir = { id: LOCAL_ID, name: 'Local', path: '' }
  if (index < 0) {
    return [local, ...extras]
  }
  return items.map((item, i) => (i === index ? local : item))
}

function applyPatch(patch: UserSettings): typeof SETTINGS_DEFAULTS {
  return {
    batchGrid: typeof patch.batchGrid === 'boolean' ? patch.batchGrid : SETTINGS_DEFAULTS.batchGrid,
    batchGridMax: typeof patch.batchGridMax === 'number' ? patch.batchGridMax : SETTINGS_DEFAULTS.batchGridMax,
    batchGridQuality: typeof patch.batchGridQuality === 'number' ? patch.batchGridQuality : SETTINGS_DEFAULTS.batchGridQuality,
    batchGridRows: typeof patch.batchGridRows === 'number' ? patch.batchGridRows : SETTINGS_DEFAULTS.batchGridRows,
    batchGridFill: typeof patch.batchGridFill === 'boolean' ? patch.batchGridFill : SETTINGS_DEFAULTS.batchGridFill,
    batchGridOnCancel: typeof patch.batchGridOnCancel === 'boolean' ? patch.batchGridOnCancel : SETTINGS_DEFAULTS.batchGridOnCancel,
    saveInterrupted: typeof patch.saveInterrupted === 'boolean' ? patch.saveInterrupted : SETTINGS_DEFAULTS.saveInterrupted,
    interruptedInGrid: typeof patch.interruptedInGrid === 'boolean' ? patch.interruptedInGrid : SETTINGS_DEFAULTS.interruptedInGrid,
    galleryHideInterrupted:
      typeof patch.galleryHideInterrupted === 'boolean'
        ? patch.galleryHideInterrupted
        : SETTINGS_DEFAULTS.galleryHideInterrupted,
    hiddenGenerateTabs: patch.hiddenGenerateTabs ? cleanTabs(patch.hiddenGenerateTabs) : SETTINGS_DEFAULTS.hiddenGenerateTabs,
    hiddenMainTabs: patch.hiddenMainTabs ? cleanHiddenMainTabs(patch.hiddenMainTabs) : SETTINGS_DEFAULTS.hiddenMainTabs,
    mainTabOrder: patch.mainTabOrder ? cleanMainTabOrder(patch.mainTabOrder) : SETTINGS_DEFAULTS.mainTabOrder,
    generateTabOrder: patch.generateTabOrder
      ? cleanGenerateTabOrder(patch.generateTabOrder)
      : SETTINGS_DEFAULTS.generateTabOrder,
    mainTabKeysFollowLayout:
      typeof patch.mainTabKeysFollowLayout === 'boolean'
        ? patch.mainTabKeysFollowLayout
        : SETTINGS_DEFAULTS.mainTabKeysFollowLayout,
    generateTabKeysFollowLayout:
      typeof patch.generateTabKeysFollowLayout === 'boolean'
        ? patch.generateTabKeysFollowLayout
        : SETTINGS_DEFAULTS.generateTabKeysFollowLayout,
    hiddenModelTypes: patch.hiddenModelTypes ? cleanTypes(patch.hiddenModelTypes) : SETTINGS_DEFAULTS.hiddenModelTypes,
    hiddenSamplers: patch.hiddenSamplers ? cleanNames(patch.hiddenSamplers) : SETTINGS_DEFAULTS.hiddenSamplers,
    hiddenSchedulers: patch.hiddenSchedulers ? cleanNames(patch.hiddenSchedulers) : SETTINGS_DEFAULTS.hiddenSchedulers,
    theme: patch.theme ? cleanTheme(patch.theme) : SETTINGS_DEFAULTS.theme,
    civitaiSite: patch.civitaiSite ? cleanCivitaiSite(patch.civitaiSite) : SETTINGS_DEFAULTS.civitaiSite,
    timeDisplay: patch.timeDisplay ? cleanTimeDisplay(patch.timeDisplay) : SETTINGS_DEFAULTS.timeDisplay,
    wildcardYamlByFilename:
      typeof patch.wildcardYamlByFilename === 'boolean'
        ? patch.wildcardYamlByFilename
        : SETTINGS_DEFAULTS.wildcardYamlByFilename,
    imagePath: cleanPath(patch.imagePath, SETTINGS_DEFAULTS.imagePath),
    gridPath: cleanPath(patch.gridPath, SETTINGS_DEFAULTS.gridPath),
    interruptedPath: cleanPath(patch.interruptedPath, SETTINGS_DEFAULTS.interruptedPath),
    imageName: cleanName(patch.imageName, SETTINGS_DEFAULTS.imageName),
    gridName: cleanName(patch.gridName, SETTINGS_DEFAULTS.gridName),
    imageFormat: patch.imageFormat ? cleanImageFormat(patch.imageFormat) : SETTINGS_DEFAULTS.imageFormat,
    imageQuality: typeof patch.imageQuality === 'number' ? cleanImageQuality(patch.imageQuality) : SETTINGS_DEFAULTS.imageQuality,
    saveLargeAsJpeg: typeof patch.saveLargeAsJpeg === 'boolean' ? patch.saveLargeAsJpeg : SETTINGS_DEFAULTS.saveLargeAsJpeg,
    largeJpegMaxKb:
      typeof patch.largeJpegMaxKb === 'number' ? cleanLargeJpegMaxKb(patch.largeJpegMaxKb) : SETTINGS_DEFAULTS.largeJpegMaxKb,
    gallerySortKey: patch.gallerySortKey ? cleanSortKeyMap(patch.gallerySortKey) : SETTINGS_DEFAULTS.gallerySortKey,
    gallerySortDir: patch.gallerySortDir ? cleanSortDirMap(patch.gallerySortDir) : SETTINGS_DEFAULTS.gallerySortDir,
    galleryTileScale:
      typeof patch.galleryTileScale === 'number' ? cleanTileScale(patch.galleryTileScale) : SETTINGS_DEFAULTS.galleryTileScale,
    galleryParentOnUnselect:
      typeof patch.galleryParentOnUnselect === 'boolean'
        ? patch.galleryParentOnUnselect
        : SETTINGS_DEFAULTS.galleryParentOnUnselect,
    promptWeightStep:
      typeof patch.promptWeightStep === 'number'
        ? cleanPromptWeightStep(patch.promptWeightStep)
        : SETTINGS_DEFAULTS.promptWeightStep,
    loraStrengthMin:
      typeof patch.loraStrengthMin === 'number'
        ? cleanLoraBound(patch.loraStrengthMin, SETTINGS_DEFAULTS.loraStrengthMin)
        : SETTINGS_DEFAULTS.loraStrengthMin,
    loraStrengthMax:
      typeof patch.loraStrengthMax === 'number'
        ? cleanLoraBound(patch.loraStrengthMax, SETTINGS_DEFAULTS.loraStrengthMax)
        : SETTINGS_DEFAULTS.loraStrengthMax,
    loraSliderMin:
      typeof patch.loraSliderMin === 'number'
        ? cleanLoraBound(patch.loraSliderMin, SETTINGS_DEFAULTS.loraSliderMin)
        : SETTINGS_DEFAULTS.loraSliderMin,
    loraSliderMax:
      typeof patch.loraSliderMax === 'number'
        ? cleanLoraBound(patch.loraSliderMax, SETTINGS_DEFAULTS.loraSliderMax)
        : SETTINGS_DEFAULTS.loraSliderMax,
    modelDirs: Array.isArray(patch.modelDirs)
      ? ensureLocal(cleanDirs(patch.modelDirs))
      : SETTINGS_DEFAULTS.modelDirs,
    wildcardDirs: Array.isArray(patch.wildcardDirs)
      ? ensureLocal(cleanDirs(patch.wildcardDirs))
      : SETTINGS_DEFAULTS.wildcardDirs,
    galleryDirs: Array.isArray(patch.galleryDirs)
      ? cleanDirs(patch.galleryDirs).filter((item) => item.id !== LOCAL_ID && item.id !== OUTPUT_ID)
      : SETTINGS_DEFAULTS.galleryDirs,
    forceDownloadModelsLocal:
      typeof patch.forceDownloadModelsLocal === 'boolean'
        ? patch.forceDownloadModelsLocal
        : SETTINGS_DEFAULTS.forceDownloadModelsLocal,
    forceDownloadWildcardsLocal:
      typeof patch.forceDownloadWildcardsLocal === 'boolean'
        ? patch.forceDownloadWildcardsLocal
        : SETTINGS_DEFAULTS.forceDownloadWildcardsLocal,
    removedAfterHours:
      typeof patch.removedAfterHours === 'number'
        ? cleanRemovedHours(patch.removedAfterHours)
        : SETTINGS_DEFAULTS.removedAfterHours,
    removedMaxGb:
      typeof patch.removedMaxGb === 'number' ? cleanRemovedMaxGb(patch.removedMaxGb) : SETTINGS_DEFAULTS.removedMaxGb,
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
  if (typeof state.batchGridOnCancel === 'boolean') {
    patch.batchGridOnCancel = state.batchGridOnCancel
  }
  if (typeof state.saveInterrupted === 'boolean') {
    patch.saveInterrupted = state.saveInterrupted
  }
  if (typeof state.interruptedInGrid === 'boolean') {
    patch.interruptedInGrid = state.interruptedInGrid
  }
  if (typeof state.galleryHideInterrupted === 'boolean') {
    patch.galleryHideInterrupted = state.galleryHideInterrupted
  }
  if (Array.isArray(state.hiddenGenerateTabs)) {
    patch.hiddenGenerateTabs = state.hiddenGenerateTabs as string[]
  }
  if (Array.isArray(state.hiddenMainTabs)) {
    patch.hiddenMainTabs = state.hiddenMainTabs as string[]
  }
  if (Array.isArray(state.mainTabOrder)) {
    patch.mainTabOrder = state.mainTabOrder as string[]
  }
  if (Array.isArray(state.generateTabOrder)) {
    patch.generateTabOrder = state.generateTabOrder as string[]
  }
  if (typeof state.mainTabKeysFollowLayout === 'boolean') {
    patch.mainTabKeysFollowLayout = state.mainTabKeysFollowLayout
  }
  if (typeof state.generateTabKeysFollowLayout === 'boolean') {
    patch.generateTabKeysFollowLayout = state.generateTabKeysFollowLayout
  }
  if (Array.isArray(state.hiddenModelTypes)) {
    patch.hiddenModelTypes = state.hiddenModelTypes as string[]
  }
  if (Array.isArray(state.hiddenSamplers)) {
    patch.hiddenSamplers = state.hiddenSamplers as string[]
  }
  if (Array.isArray(state.hiddenSchedulers)) {
    patch.hiddenSchedulers = state.hiddenSchedulers as string[]
  }
  if (typeof state.theme === 'string') {
    patch.theme = state.theme
  }
  if (typeof state.civitaiSite === 'string') {
    patch.civitaiSite = state.civitaiSite
  }
  if (typeof state.timeDisplay === 'string') {
    patch.timeDisplay = state.timeDisplay
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
  if (typeof state.interruptedPath === 'string') {
    patch.interruptedPath = state.interruptedPath
  }
  if (typeof state.imageName === 'string') {
    patch.imageName = state.imageName
  }
  if (typeof state.gridName === 'string') {
    patch.gridName = state.gridName
  }
  if (typeof state.imageFormat === 'string') {
    patch.imageFormat = state.imageFormat
  }
  if (typeof state.imageQuality === 'number') {
    patch.imageQuality = state.imageQuality
  }
  if (typeof state.saveLargeAsJpeg === 'boolean') {
    patch.saveLargeAsJpeg = state.saveLargeAsJpeg
  }
  if (typeof state.largeJpegMaxKb === 'number') {
    patch.largeJpegMaxKb = state.largeJpegMaxKb
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
  if (typeof state.galleryParentOnUnselect === 'boolean') {
    patch.galleryParentOnUnselect = state.galleryParentOnUnselect
  }
  if (typeof state.promptWeightStep === 'number') {
    patch.promptWeightStep = state.promptWeightStep
  }
  if (typeof state.removedAfterHours === 'number') {
    patch.removedAfterHours = state.removedAfterHours
  }
  if (typeof state.removedMaxGb === 'number') {
    patch.removedMaxGb = state.removedMaxGb
  }
  return patch
}

let timer = 0

function flush() {
  const state = useSettingsStore.getState()
  if (!state.loaded) {
    return Promise.resolve()
  }
  return saveSettings(diff(state)).then(() => undefined).catch(() => {})
}

function persist() {
  window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    void flush()
  }, 200)
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
  setBatchGridOnCancel: (batchGridOnCancel) => {
    set({ batchGridOnCancel })
    persist()
  },
  setSaveInterrupted: (saveInterrupted) => {
    set({ saveInterrupted })
    persist()
  },
  setInterruptedInGrid: (interruptedInGrid) => {
    set({ interruptedInGrid })
    persist()
  },
  setGalleryHideInterrupted: (galleryHideInterrupted) => {
    set({ galleryHideInterrupted })
    persist()
  },
  setHiddenGenerateTabs: (hiddenGenerateTabs) => {
    set({ hiddenGenerateTabs: hiddenGenerateTabs.filter((item) => item !== 'Generation') })
    persist()
  },
  setHiddenMainTabs: (hiddenMainTabs) => {
    set({ hiddenMainTabs: cleanHiddenMainTabs(hiddenMainTabs) })
    persist()
  },
  setMainTabOrder: (mainTabOrder) => {
    set({ mainTabOrder: cleanMainTabOrder(mainTabOrder) })
    persist()
  },
  setGenerateTabOrder: (generateTabOrder) => {
    set({ generateTabOrder: cleanGenerateTabOrder(generateTabOrder) })
    persist()
  },
  setMainTabKeysFollowLayout: (mainTabKeysFollowLayout) => {
    set({ mainTabKeysFollowLayout })
    persist()
  },
  setGenerateTabKeysFollowLayout: (generateTabKeysFollowLayout) => {
    set({ generateTabKeysFollowLayout })
    persist()
  },
  setHiddenModelTypes: (hiddenModelTypes) => {
    set({ hiddenModelTypes })
    persist()
  },
  setHiddenSamplers: (hiddenSamplers) => {
    set({ hiddenSamplers: cleanNames(hiddenSamplers) })
    persist()
  },
  setHiddenSchedulers: (hiddenSchedulers) => {
    set({ hiddenSchedulers: cleanNames(hiddenSchedulers) })
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
  setTimeDisplay: (timeDisplay) => {
    set({ timeDisplay: cleanTimeDisplay(timeDisplay) })
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
  setInterruptedPath: (interruptedPath) => {
    set({ interruptedPath })
    persist()
  },
  setImageName: (imageName) => {
    set({ imageName })
    persist()
  },
  setGridName: (gridName) => {
    set({ gridName })
    persist()
  },
  setImageFormat: (imageFormat) => {
    set({ imageFormat: cleanImageFormat(imageFormat) })
    persist()
  },
  setImageQuality: (imageQuality) => {
    set({ imageQuality: cleanImageQuality(imageQuality) })
    persist()
  },
  setSaveLargeAsJpeg: (saveLargeAsJpeg) => {
    set({ saveLargeAsJpeg })
    persist()
  },
  setLargeJpegMaxKb: (largeJpegMaxKb) => {
    set({ largeJpegMaxKb: cleanLargeJpegMaxKb(largeJpegMaxKb) })
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
  setGalleryParentOnUnselect: (galleryParentOnUnselect) => {
    set({ galleryParentOnUnselect })
    persist()
  },
  setPromptWeightStep: (promptWeightStep) => {
    set({ promptWeightStep: cleanPromptWeightStep(promptWeightStep) })
    persist()
  },
  setLoraStrengthMin: (loraStrengthMin) => {
    set({ loraStrengthMin: cleanLoraBound(loraStrengthMin, SETTINGS_DEFAULTS.loraStrengthMin) })
    persist()
  },
  setLoraStrengthMax: (loraStrengthMax) => {
    set({ loraStrengthMax: cleanLoraBound(loraStrengthMax, SETTINGS_DEFAULTS.loraStrengthMax) })
    persist()
  },
  setLoraSliderMin: (loraSliderMin) => {
    set({ loraSliderMin: cleanLoraBound(loraSliderMin, SETTINGS_DEFAULTS.loraSliderMin) })
    persist()
  },
  setLoraSliderMax: (loraSliderMax) => {
    set({ loraSliderMax: cleanLoraBound(loraSliderMax, SETTINGS_DEFAULTS.loraSliderMax) })
    persist()
  },
  setModelDirs: (modelDirs) => {
    set({ modelDirs: ensureLocal(cleanDirs(modelDirs)) })
    persist()
  },
  setWildcardDirs: (wildcardDirs) => {
    set({ wildcardDirs: ensureLocal(cleanDirs(wildcardDirs)) })
    persist()
  },
  setGalleryDirs: (galleryDirs) => {
    set({ galleryDirs: cleanDirs(galleryDirs).filter((item) => item.id !== LOCAL_ID && item.id !== OUTPUT_ID) })
    persist()
  },
  setForceDownloadModelsLocal: (forceDownloadModelsLocal) => {
    set({ forceDownloadModelsLocal })
    persist()
  },
  setForceDownloadWildcardsLocal: (forceDownloadWildcardsLocal) => {
    set({ forceDownloadWildcardsLocal })
    persist()
  },
  setRemovedAfterHours: (removedAfterHours) => {
    set({ removedAfterHours: cleanRemovedHours(removedAfterHours) })
    persist()
  },
  setRemovedMaxGb: (removedMaxGb) => {
    set({ removedMaxGb: cleanRemovedMaxGb(removedMaxGb) })
    persist()
  },
}))
