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
import { cleanSetResolutions, DEFAULT_SET_RESOLUTIONS } from '@/screens/generate/resolutions.ts'
import { CIVITAI_BROWSE_DEFAULT, cleanCivitaiBrowse, type CivitaiBrowse } from '@/lib/civitaiBrowse.ts'
import { cleanCivitaiTabId, cleanCivitaiTabs, type CivitaiTab } from '@/lib/civitaiVersion.ts'
import {
  CIVITAI_DOWNLOAD_DEFAULT,
  cleanCivitaiDownload,
  type CivitaiDownloadSettings,
} from '@/lib/civitaiDownload.ts'

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
export type GalleryFilterScope = 'global' | 'local'

export const GENERATE_FILTER_VIEWS = [
  { key: 'checkpoints', label: 'Base Model' },
  { key: 'loras', label: 'LoRA' },
  { key: 'wildcards', label: 'Wildcards' },
] as const

export const MODELS_FILTER_VIEWS = [
  { key: 'models-all', label: 'All' },
  { key: 'models-checkpoints', label: 'Base Model' },
  { key: 'models-loras', label: 'LoRA' },
  { key: 'models-wildcards', label: 'Wildcards' },
] as const

export const GALLERY_MODE_KEYS = ['checkpoints', 'loras', 'wildcards', 'models'] as const

export type GalleryModeKey = (typeof GALLERY_MODE_KEYS)[number]

export const GALLERY_MODE_DEFAULTS: Record<GalleryModeKey, GalleryFilterScope> = {
  checkpoints: 'global',
  loras: 'global',
  wildcards: 'global',
  models: 'local',
}

export type GalleryLocalScope = {
  ids: string[]
  optionalIds: string[]
  auto: boolean
  mode: 'likely' | 'exact'
  fallback: boolean
}

export const LOCAL_SCOPE_DEFAULT: GalleryLocalScope = {
  ids: [],
  optionalIds: [],
  auto: false,
  mode: 'likely',
  fallback: false,
}

const GALLERY_LOCAL_KEYS = new Set<string>([
  ...GENERATE_FILTER_VIEWS.map((item) => item.key),
  'models',
  ...MODELS_FILTER_VIEWS.map((item) => item.key),
])

const GALLERY_FILTER_KEYS = new Set<string>(['global', ...GALLERY_LOCAL_KEYS])

const GALLERY_MODE_KEY_SET = new Set<string>(GALLERY_MODE_KEYS)

export function galleryModeKey(viewKey: string): GalleryModeKey {
  if (viewKey.startsWith('models')) {
    return 'models'
  }
  if (viewKey === 'loras' || viewKey === 'wildcards') {
    return viewKey
  }
  return 'checkpoints'
}

export function galleryModeValue(
  map: Record<string, GalleryFilterScope>,
  key: GalleryModeKey,
): GalleryFilterScope {
  return map[key] ?? GALLERY_MODE_DEFAULTS[key]
}

function galleryStoreKey(
  viewKey: string,
  modeMap: Record<string, GalleryFilterScope>,
  shareModels: boolean,
): string {
  const modeKey = galleryModeKey(viewKey)
  if (galleryModeValue(modeMap, modeKey) === 'global') {
    return 'global'
  }
  if (modeKey === 'models' && shareModels) {
    return 'models'
  }
  return viewKey
}

export function galleryFilterKey(
  viewKey: string,
  state: {
    galleryFilterMode: Record<string, GalleryFilterScope>
    galleryFilterShareModels: boolean
  },
): string {
  return galleryStoreKey(viewKey, state.galleryFilterMode, state.galleryFilterShareModels)
}

export function galleryScopeKey(
  viewKey: string,
  state: {
    galleryScopeMode: Record<string, GalleryFilterScope>
    galleryFilterShareModels: boolean
  },
): string {
  return galleryStoreKey(viewKey, state.galleryScopeMode, state.galleryFilterShareModels)
}

const SORT_KEYS = new Set<string>(['name', 'added', 'edited', 'path'])

export const IMAGE_FORMATS = [
  { value: 'png', label: 'PNG' },
  { value: 'jpg', label: 'JPEG' },
  { value: 'webp', label: 'WebP' },
] as const

export type ImageFormat = (typeof IMAGE_FORMATS)[number]['value']

const IMAGE_FORMAT_IDS = new Set<string>(IMAGE_FORMATS.map((item) => item.value))

export type AutocompleteMode = 'exclude' | 'include'

export type AutocompleteListRule = {
  enabled: boolean
  mode: AutocompleteMode
  types: string[]
}

export const AUTOCOMPLETE_LIST_DEFAULT: AutocompleteListRule = {
  enabled: true,
  mode: 'exclude',
  types: [],
}

export function autocompleteListRule(lists: Record<string, AutocompleteListRule>, name: string): AutocompleteListRule {
  return lists[name] ?? AUTOCOMPLETE_LIST_DEFAULT
}

export function autocompleteApplies(mode: AutocompleteMode, types: string[], modelTypes: string[]): boolean {
  if (!modelTypes.length) {
    return mode === 'exclude'
  }
  if (mode === 'exclude') {
    return !modelTypes.some((item) => types.includes(item))
  }
  return modelTypes.some((item) => types.includes(item))
}

export const SETTINGS_DEFAULTS = {
  batchGrid: true,
  batchGridMax: 36,
  batchGridQuality: 85,
  batchGridRows: 0,
  batchGridFill: false,
  batchGridOnCancel: true,
  saveInterrupted: true,
  genPreview: true,
  genPreviewEvery: 4,
  genPreviewAfter: 8,
  genPreviewAfterFirst: true,
  genPreviewLast: true,
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
  civitaiApiKey: '',
  civitaiAutoRetry: true,
  civitaiAutoRetryCount: 20,
  timeDisplay: 'full' as TimeDisplay,
  setResolutions: [...DEFAULT_SET_RESOLUTIONS],
  imagePath: '[workflow]/images/[date]',
  gridPath: '[workflow]/grids/[date]',
  interruptedPath: '[workflow]/interrupted/[date]',
  imageName: 'blombo_[number]',
  gridName: 'blombo_[number]',
  imageFormat: 'png' as ImageFormat,
  gridFormat: 'jpg' as ImageFormat,
  imageQuality: 100,
  saveLargeAsJpeg: false,
  largeJpegMaxKb: 4096,
  gallerySortKey: {} as Record<string, GallerySortKey>,
  gallerySortDir: {} as Record<string, GallerySortDir>,
  galleryTileScale: 1,
  galleryParentOnUnselect: true,
  promptWeightStep: 0.1,
  loraStrengthMin: 0,
  loraStrengthMax: 1,
  loraSliderMin: -5,
  loraSliderMax: 5,
  loraAutoApply: true,
  loraApplyAt: 'start' as 'start' | 'end',
  modelDirs: [{ id: LOCAL_ID, name: 'Local', path: '' }] as FolderDir[],
  wildcardDirs: [{ id: LOCAL_ID, name: 'Local', path: '' }] as FolderDir[],
  galleryDirs: [] as FolderDir[],
  civitaiDownload: { ...CIVITAI_DOWNLOAD_DEFAULT },
  removedAfterHours: 48,
  removedMaxGb: 100,
  autocompleteEnabled: true,
  autocompleteMode: 'exclude' as AutocompleteMode,
  autocompleteTypes: [] as string[],
  wildcardCompleteEnabled: true,
  loraCompleteEnabled: true,
  loraTriggerCompleteEnabled: true,
  wildcardCompleteThumbs: true,
  loraCompleteThumbs: true,
  autocompleteThumbScale: 1,
  frequentTagsEnabled: true,
  autocompleteLists: {} as Record<string, AutocompleteListRule>,
  galleryThumbFallback: false,
  thumbSaveTo: 'global' as 'active' | 'global',
  thumbDisplayMode: 'likely' as 'likely' | 'exact',
  thumbScopeIds: [] as string[],
  thumbScopeOptionalIds: [] as string[],
  thumbScopeAuto: false,
  trashThumbFallback: false,
  scopeGroups: [] as string[],
  scopeOrder: [] as string[],
  lookupScopeIds: [] as string[],
  lookupScopeOptionalIds: [] as string[],
  lookupKinds: [] as string[],
  lookupModels: [] as string[],
  scopeSearch: '',
  modelsTab: 'Local' as 'Local' | 'CivitAI',
  modelsKind: 'all' as 'all' | 'checkpoints' | 'loras' | 'wildcards',
  civitaiBrowse: { ...CIVITAI_BROWSE_DEFAULT },
  civitaiTabs: [] as CivitaiTab[],
  civitaiTabId: null as number | null,
  galleryTypes: {} as Record<string, string[]>,
  galleryQuery: {} as Record<string, string>,
  galleryLocalScopes: {} as Record<string, GalleryLocalScope>,
  galleryScopeMode: {} as Record<string, GalleryFilterScope>,
  galleryFilterMode: {} as Record<string, GalleryFilterScope>,
  galleryFilterShareModels: true,
  galleryPinSelected: {} as Record<string, boolean>,
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
  setGenPreview: (value: boolean) => void
  setGenPreviewEvery: (value: number) => void
  setGenPreviewAfter: (value: number) => void
  setGenPreviewAfterFirst: (value: boolean) => void
  setGenPreviewLast: (value: boolean) => void
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
  setCivitaiApiKey: (value: string) => void
  setCivitaiAutoRetry: (value: boolean) => void
  setCivitaiAutoRetryCount: (value: number) => void
  setTimeDisplay: (value: TimeDisplay) => void
  setSetResolutions: (value: string[]) => void
  setImagePath: (value: string) => void
  setGridPath: (value: string) => void
  setInterruptedPath: (value: string) => void
  setImageName: (value: string) => void
  setGridName: (value: string) => void
  setImageFormat: (value: ImageFormat) => void
  setGridFormat: (value: ImageFormat) => void
  setImageQuality: (value: number) => void
  setSaveLargeAsJpeg: (value: boolean) => void
  setLargeJpegMaxKb: (value: number) => void
  setGallerySortKey: (key: string, value: GallerySortKey) => void
  setGallerySortDir: (key: string, value: GallerySortDir) => void
  setGalleryTileScale: (value: number) => void
  setGalleryParentOnUnselect: (value: boolean) => void
  setPromptWeightStep: (value: number) => void
  setLoraStrengthMin: (value: number) => void
  setLoraStrengthMax: (value: number) => void
  setLoraSliderMin: (value: number) => void
  setLoraSliderMax: (value: number) => void
  setLoraAutoApply: (value: boolean) => void
  setLoraApplyAt: (value: 'start' | 'end') => void
  setModelDirs: (value: FolderDir[]) => void
  setWildcardDirs: (value: FolderDir[]) => void
  setGalleryDirs: (value: FolderDir[]) => void
  setCivitaiDownload: (value: Partial<CivitaiDownloadSettings>) => void
  setRemovedAfterHours: (value: number) => void
  setRemovedMaxGb: (value: number) => void
  setAutocompleteEnabled: (value: boolean) => void
  setAutocompleteMode: (value: AutocompleteMode) => void
  setAutocompleteTypes: (value: string[]) => void
  setWildcardCompleteEnabled: (value: boolean) => void
  setLoraCompleteEnabled: (value: boolean) => void
  setLoraTriggerCompleteEnabled: (value: boolean) => void
  setWildcardCompleteThumbs: (value: boolean) => void
  setLoraCompleteThumbs: (value: boolean) => void
  setAutocompleteThumbScale: (value: number) => void
  setFrequentTagsEnabled: (value: boolean) => void
  setAutocompleteList: (name: string, patch: Partial<AutocompleteListRule>) => void
  setGalleryThumbFallback: (value: boolean) => void
  setThumbSaveTo: (value: 'active' | 'global') => void
  setThumbDisplayMode: (value: 'likely' | 'exact') => void
  setThumbScopeIds: (value: string[]) => void
  setThumbScopeOptionalIds: (value: string[]) => void
  setThumbScopeAuto: (value: boolean) => void
  setTrashThumbFallback: (value: boolean) => void
  setScopeGroups: (value: string[]) => void
  setScopeOrder: (value: string[]) => void
  setLookupScopeIds: (value: string[]) => void
  setLookupScopeOptionalIds: (value: string[]) => void
  setLookupKinds: (value: string[]) => void
  setLookupModels: (value: string[]) => void
  setScopeSearch: (value: string) => void
  setModelsTab: (value: 'Local' | 'CivitAI') => void
  setModelsKind: (value: 'all' | 'checkpoints' | 'loras' | 'wildcards') => void
  setCivitaiBrowse: (value: Partial<CivitaiBrowse>) => void
  setCivitaiTabs: (value: CivitaiTab[]) => void
  setCivitaiTabId: (value: number | null) => void
  setGalleryTypes: (key: string, value: string[]) => void
  setGalleryQuery: (key: string, value: string) => void
  setGalleryLocalScope: (key: string, patch: Partial<GalleryLocalScope>) => void
  dropGalleryLocalScopeId: (id: string) => void
  setGalleryScopeMode: (key: GalleryModeKey, value: GalleryFilterScope) => void
  setGalleryFilterMode: (key: GalleryModeKey, value: GalleryFilterScope) => void
  setGalleryFilterShareModels: (value: boolean) => void
  setGalleryPinSelected: (key: string, value: boolean) => void
}

const KEYS = [
  'batchGrid',
  'batchGridMax',
  'batchGridQuality',
  'batchGridRows',
  'batchGridFill',
  'batchGridOnCancel',
  'saveInterrupted',
  'genPreview',
  'genPreviewEvery',
  'genPreviewAfter',
  'genPreviewAfterFirst',
  'genPreviewLast',
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
  'civitaiApiKey',
  'civitaiAutoRetry',
  'civitaiAutoRetryCount',
  'timeDisplay',
  'setResolutions',
  'imagePath',
  'gridPath',
  'interruptedPath',
  'imageName',
  'gridName',
  'imageFormat',
  'gridFormat',
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
  'loraAutoApply',
  'loraApplyAt',
  'modelDirs',
  'wildcardDirs',
  'galleryDirs',
  'civitaiDownload',
  'removedAfterHours',
  'removedMaxGb',
  'autocompleteEnabled',
  'autocompleteMode',
  'autocompleteTypes',
  'wildcardCompleteEnabled',
  'loraCompleteEnabled',
  'loraTriggerCompleteEnabled',
  'wildcardCompleteThumbs',
  'loraCompleteThumbs',
  'autocompleteThumbScale',
  'frequentTagsEnabled',
  'autocompleteLists',
  'galleryThumbFallback',
  'thumbSaveTo',
  'thumbDisplayMode',
  'thumbScopeIds',
  'thumbScopeOptionalIds',
  'thumbScopeAuto',
  'trashThumbFallback',
  'scopeGroups',
  'scopeOrder',
  'lookupScopeIds',
  'lookupScopeOptionalIds',
  'lookupKinds',
  'lookupModels',
  'scopeSearch',
  'modelsTab',
  'modelsKind',
  'civitaiBrowse',
  'civitaiTabs',
  'civitaiTabId',
  'galleryTypes',
  'galleryQuery',
  'galleryLocalScopes',
  'galleryScopeMode',
  'galleryFilterMode',
  'galleryFilterShareModels',
  'galleryPinSelected',
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
    const name = (item === 'Checkpoints' ? 'Base Model' : item === 'Lora' ? 'LoRa' : String(item)) as GenerateTab
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

function cleanImageFormat(raw: unknown, fallback: ImageFormat = SETTINGS_DEFAULTS.imageFormat): ImageFormat {
  const name = raw === 'jpeg' ? 'jpg' : raw
  return IMAGE_FORMAT_IDS.has(name as string) ? (name as ImageFormat) : fallback
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

function cleanListTypes(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
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

function cleanScopeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const out: string[] = []
  for (const item of raw) {
    const name = String(item).trim().toLowerCase()
    if (!name || name === 'global' || out.includes(name)) {
      continue
    }
    if (!/^[a-f0-9]{12}$/.test(name)) {
      continue
    }
    out.push(name)
  }
  return out
}

function cleanFilterScopeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const out: string[] = []
  for (const item of raw) {
    const name = String(item).trim().toLowerCase()
    if (!name || out.includes(name)) {
      continue
    }
    if (name === 'global') {
      return ['global']
    }
    if (!/^[a-f0-9]{12}$/.test(name)) {
      continue
    }
    out.push(name)
  }
  return out
}

function cleanLookupKinds(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const out: string[] = []
  for (const item of raw) {
    const name = String(item)
    if ((name === 'checkpoints' || name === 'loras' || name === 'wildcards') && !out.includes(name)) {
      out.push(name)
    }
  }
  return out
}

function cleanLookupModels(raw: unknown): string[] {
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

function cleanSearch(raw: unknown): string {
  return typeof raw === 'string' ? raw.slice(0, 200) : ''
}

function cleanModelsTab(raw: unknown): 'Local' | 'CivitAI' {
  return raw === 'CivitAI' || raw === 'Download' ? 'CivitAI' : 'Local'
}

function cleanModelsKind(raw: unknown): 'all' | 'checkpoints' | 'loras' | 'wildcards' {
  if (raw === 'checkpoints' || raw === 'loras' || raw === 'wildcards' || raw === 'all') {
    return raw
  }
  return 'all'
}

function cleanTypeList(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const allowed = new Set(MODEL_TYPES)
  const out: string[] = []
  for (const item of raw) {
    const name = String(item)
    if (allowed.has(name) && !out.includes(name)) {
      out.push(name)
    }
  }
  return out
}

function cleanGalleryTypes(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const out: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const name = key.trim().slice(0, 80)
    if (!name) {
      continue
    }
    out[name] = cleanTypeList(value)
  }
  return out
}

function cleanFilterScope(raw: unknown, fallback: GalleryFilterScope): GalleryFilterScope {
  return raw === 'global' || raw === 'local' ? raw : fallback
}

function cleanModeMap(raw: unknown): Record<string, GalleryFilterScope> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const out: Record<string, GalleryFilterScope> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!GALLERY_MODE_KEY_SET.has(key) || (value !== 'global' && value !== 'local')) {
      continue
    }
    if (value !== GALLERY_MODE_DEFAULTS[key as GalleryModeKey]) {
      out[key] = value
    }
  }
  return out
}

function cleanGalleryPinSelected(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const out: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (GALLERY_FILTER_KEYS.has(key) && typeof value === 'boolean' && !value) {
      out[key] = false
    }
  }
  return out
}

function emptyLocalScope(pack: GalleryLocalScope) {
  return (
    pack.ids.length === 0 &&
    pack.optionalIds.length === 0 &&
    !pack.auto &&
    pack.mode === 'likely' &&
    !pack.fallback
  )
}

function cleanLocalScope(raw: unknown): GalleryLocalScope | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const row = raw as Record<string, unknown>
  const pack: GalleryLocalScope = {
    ids: cleanScopeIds(row.ids),
    optionalIds: cleanScopeIds(row.optionalIds),
    auto: Boolean(row.auto),
    mode: row.mode === 'exact' ? 'exact' : 'likely',
    fallback: Boolean(row.fallback),
  }
  return emptyLocalScope(pack) ? null : pack
}

function cleanLocalScopes(raw: unknown): Record<string, GalleryLocalScope> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const out: Record<string, GalleryLocalScope> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!GALLERY_LOCAL_KEYS.has(key)) {
      continue
    }
    const pack = cleanLocalScope(value)
    if (pack) {
      out[key] = pack
    }
  }
  return out
}

function cleanQueryMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const name = key.trim().slice(0, 80)
    const text = cleanSearch(value)
    if (name && text) {
      out[name] = text
    }
  }
  return out
}

function cleanFallback(raw: unknown): boolean {
  if (typeof raw === 'boolean') {
    return raw
  }
  if (!raw || typeof raw !== 'object') {
    return SETTINGS_DEFAULTS.galleryThumbFallback
  }
  const row = raw as Record<string, unknown>
  return Boolean(row.checkpoints || row.loras || row.wildcards)
}

function cleanAutocompleteLists(raw: unknown): Record<string, AutocompleteListRule> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const out: Record<string, AutocompleteListRule> = {}
  for (const [key, item] of Object.entries(raw as Record<string, unknown>)) {
    const name = key.replaceAll('\\', '/').split('/').pop() || ''
    if (!name.endsWith('.csv') || !item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }
    const row = item as Record<string, unknown>
    out[name] = {
      enabled: typeof row.enabled === 'boolean' ? row.enabled : AUTOCOMPLETE_LIST_DEFAULT.enabled,
      mode: row.mode === 'include' ? 'include' : 'exclude',
      types: cleanListTypes(row.types),
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

function cleanSortKeyMap(raw: unknown): Record<string, GallerySortKey> {
  if (typeof raw === 'string') {
    const value = cleanSortKey(raw)
    if (value === 'name') {
      return {}
    }
    return { checkpoints: value, loras: value, wildcards: value }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const out: Record<string, GallerySortKey> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const name = key.trim().slice(0, 80)
    const sort = cleanSortKey(value)
    if (name && sort !== 'name') {
      out[name] = sort
    }
  }
  return out
}

function cleanSortDirMap(raw: unknown): Record<string, GallerySortDir> {
  if (typeof raw === 'string') {
    const value = cleanSortDir(raw)
    if (value === 'asc') {
      return {}
    }
    return { checkpoints: value, loras: value, wildcards: value }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const out: Record<string, GallerySortDir> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const name = key.trim().slice(0, 80)
    const dir = cleanSortDir(value)
    if (name && dir !== 'asc') {
      out[name] = dir
    }
  }
  return out
}

function cleanCompleteThumbScale(raw: unknown) {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) {
    return SETTINGS_DEFAULTS.autocompleteThumbScale
  }
  return Math.round(Math.min(2, Math.max(0.5, n)) * 10) / 10
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

function cleanPreviewCount(raw: unknown, fallback: number) {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) {
    return fallback
  }
  return Math.max(1, Math.min(150, Math.round(n)))
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
  const modelDirs = Array.isArray(patch.modelDirs)
    ? ensureLocal(cleanDirs(patch.modelDirs))
    : SETTINGS_DEFAULTS.modelDirs
  const wildcardDirs = Array.isArray(patch.wildcardDirs)
    ? ensureLocal(cleanDirs(patch.wildcardDirs))
    : SETTINGS_DEFAULTS.wildcardDirs
  const galleryDirs = Array.isArray(patch.galleryDirs)
    ? cleanDirs(patch.galleryDirs).filter((item) => item.id !== LOCAL_ID && item.id !== OUTPUT_ID)
    : SETTINGS_DEFAULTS.galleryDirs
  const civitaiDownload = cleanCivitaiDownload(patch.civitaiDownload, modelDirs, wildcardDirs)
  return {
    batchGrid: typeof patch.batchGrid === 'boolean' ? patch.batchGrid : SETTINGS_DEFAULTS.batchGrid,
    batchGridMax: typeof patch.batchGridMax === 'number' ? patch.batchGridMax : SETTINGS_DEFAULTS.batchGridMax,
    batchGridQuality: typeof patch.batchGridQuality === 'number' ? patch.batchGridQuality : SETTINGS_DEFAULTS.batchGridQuality,
    batchGridRows: typeof patch.batchGridRows === 'number' ? patch.batchGridRows : SETTINGS_DEFAULTS.batchGridRows,
    batchGridFill: typeof patch.batchGridFill === 'boolean' ? patch.batchGridFill : SETTINGS_DEFAULTS.batchGridFill,
    batchGridOnCancel: typeof patch.batchGridOnCancel === 'boolean' ? patch.batchGridOnCancel : SETTINGS_DEFAULTS.batchGridOnCancel,
    saveInterrupted: typeof patch.saveInterrupted === 'boolean' ? patch.saveInterrupted : SETTINGS_DEFAULTS.saveInterrupted,
    genPreview: typeof patch.genPreview === 'boolean' ? patch.genPreview : SETTINGS_DEFAULTS.genPreview,
    genPreviewEvery:
      typeof patch.genPreviewEvery === 'number'
        ? cleanPreviewCount(patch.genPreviewEvery, SETTINGS_DEFAULTS.genPreviewEvery)
        : SETTINGS_DEFAULTS.genPreviewEvery,
    genPreviewAfter:
      typeof patch.genPreviewAfter === 'number'
        ? cleanPreviewCount(patch.genPreviewAfter, SETTINGS_DEFAULTS.genPreviewAfter)
        : SETTINGS_DEFAULTS.genPreviewAfter,
    genPreviewAfterFirst:
      typeof patch.genPreviewAfterFirst === 'boolean'
        ? patch.genPreviewAfterFirst
        : SETTINGS_DEFAULTS.genPreviewAfterFirst,
    genPreviewLast: typeof patch.genPreviewLast === 'boolean' ? patch.genPreviewLast : SETTINGS_DEFAULTS.genPreviewLast,
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
    civitaiApiKey: typeof patch.civitaiApiKey === 'string' ? patch.civitaiApiKey.trim() : SETTINGS_DEFAULTS.civitaiApiKey,
    civitaiAutoRetry:
      typeof patch.civitaiAutoRetry === 'boolean' ? patch.civitaiAutoRetry : SETTINGS_DEFAULTS.civitaiAutoRetry,
    civitaiAutoRetryCount:
      typeof patch.civitaiAutoRetryCount === 'number'
        ? cleanPreviewCount(patch.civitaiAutoRetryCount, SETTINGS_DEFAULTS.civitaiAutoRetryCount)
        : SETTINGS_DEFAULTS.civitaiAutoRetryCount,
    timeDisplay: patch.timeDisplay ? cleanTimeDisplay(patch.timeDisplay) : SETTINGS_DEFAULTS.timeDisplay,
    setResolutions: Array.isArray(patch.setResolutions)
      ? cleanSetResolutions(patch.setResolutions)
      : SETTINGS_DEFAULTS.setResolutions,
    imagePath: cleanPath(patch.imagePath, SETTINGS_DEFAULTS.imagePath),
    gridPath: cleanPath(patch.gridPath, SETTINGS_DEFAULTS.gridPath),
    interruptedPath: cleanPath(patch.interruptedPath, SETTINGS_DEFAULTS.interruptedPath),
    imageName: cleanName(patch.imageName, SETTINGS_DEFAULTS.imageName),
    gridName: cleanName(patch.gridName, SETTINGS_DEFAULTS.gridName),
    imageFormat: patch.imageFormat ? cleanImageFormat(patch.imageFormat) : SETTINGS_DEFAULTS.imageFormat,
    gridFormat: patch.gridFormat ? cleanImageFormat(patch.gridFormat, SETTINGS_DEFAULTS.gridFormat) : SETTINGS_DEFAULTS.gridFormat,
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
    loraAutoApply:
      typeof patch.loraAutoApply === 'boolean' ? patch.loraAutoApply : SETTINGS_DEFAULTS.loraAutoApply,
    loraApplyAt: patch.loraApplyAt === 'end' ? 'end' : SETTINGS_DEFAULTS.loraApplyAt,
    modelDirs,
    wildcardDirs,
    galleryDirs,
    civitaiDownload,
    removedAfterHours:
      typeof patch.removedAfterHours === 'number'
        ? cleanRemovedHours(patch.removedAfterHours)
        : SETTINGS_DEFAULTS.removedAfterHours,
    removedMaxGb:
      typeof patch.removedMaxGb === 'number' ? cleanRemovedMaxGb(patch.removedMaxGb) : SETTINGS_DEFAULTS.removedMaxGb,
    autocompleteEnabled:
      typeof patch.autocompleteEnabled === 'boolean' ? patch.autocompleteEnabled : SETTINGS_DEFAULTS.autocompleteEnabled,
    autocompleteMode: patch.autocompleteMode === 'include' ? 'include' : SETTINGS_DEFAULTS.autocompleteMode,
    autocompleteTypes: patch.autocompleteTypes ? cleanListTypes(patch.autocompleteTypes) : SETTINGS_DEFAULTS.autocompleteTypes,
    wildcardCompleteEnabled:
      typeof patch.wildcardCompleteEnabled === 'boolean'
        ? patch.wildcardCompleteEnabled
        : SETTINGS_DEFAULTS.wildcardCompleteEnabled,
    loraCompleteEnabled:
      typeof patch.loraCompleteEnabled === 'boolean' ? patch.loraCompleteEnabled : SETTINGS_DEFAULTS.loraCompleteEnabled,
    loraTriggerCompleteEnabled:
      typeof patch.loraTriggerCompleteEnabled === 'boolean'
        ? patch.loraTriggerCompleteEnabled
        : SETTINGS_DEFAULTS.loraTriggerCompleteEnabled,
    wildcardCompleteThumbs:
      typeof patch.wildcardCompleteThumbs === 'boolean'
        ? patch.wildcardCompleteThumbs
        : SETTINGS_DEFAULTS.wildcardCompleteThumbs,
    loraCompleteThumbs:
      typeof patch.loraCompleteThumbs === 'boolean' ? patch.loraCompleteThumbs : SETTINGS_DEFAULTS.loraCompleteThumbs,
    autocompleteThumbScale:
      typeof patch.autocompleteThumbScale === 'number'
        ? cleanCompleteThumbScale(patch.autocompleteThumbScale)
        : SETTINGS_DEFAULTS.autocompleteThumbScale,
    frequentTagsEnabled:
      typeof patch.frequentTagsEnabled === 'boolean' ? patch.frequentTagsEnabled : SETTINGS_DEFAULTS.frequentTagsEnabled,
    autocompleteLists: patch.autocompleteLists
      ? cleanAutocompleteLists(patch.autocompleteLists)
      : SETTINGS_DEFAULTS.autocompleteLists,
    galleryThumbFallback: patch.galleryThumbFallback != null
      ? cleanFallback(patch.galleryThumbFallback)
      : SETTINGS_DEFAULTS.galleryThumbFallback,
    thumbSaveTo: patch.thumbSaveTo === 'active' ? 'active' : SETTINGS_DEFAULTS.thumbSaveTo,
    thumbDisplayMode: patch.thumbDisplayMode === 'exact' ? 'exact' : SETTINGS_DEFAULTS.thumbDisplayMode,
    thumbScopeIds: Array.isArray(patch.thumbScopeIds) ? cleanScopeIds(patch.thumbScopeIds) : SETTINGS_DEFAULTS.thumbScopeIds,
    thumbScopeOptionalIds: Array.isArray(patch.thumbScopeOptionalIds)
      ? cleanScopeIds(patch.thumbScopeOptionalIds)
      : SETTINGS_DEFAULTS.thumbScopeOptionalIds,
    thumbScopeAuto: typeof patch.thumbScopeAuto === 'boolean' ? patch.thumbScopeAuto : SETTINGS_DEFAULTS.thumbScopeAuto,
    trashThumbFallback:
      typeof patch.trashThumbFallback === 'boolean' ? patch.trashThumbFallback : SETTINGS_DEFAULTS.trashThumbFallback,
    scopeGroups: Array.isArray(patch.scopeGroups) ? cleanNames(patch.scopeGroups) : SETTINGS_DEFAULTS.scopeGroups,
    scopeOrder: Array.isArray(patch.scopeOrder) ? cleanScopeIds(patch.scopeOrder) : SETTINGS_DEFAULTS.scopeOrder,
    lookupScopeIds: Array.isArray(patch.lookupScopeIds)
      ? cleanFilterScopeIds(patch.lookupScopeIds)
      : SETTINGS_DEFAULTS.lookupScopeIds,
    lookupScopeOptionalIds: (
      Array.isArray(patch.lookupScopeOptionalIds)
        ? cleanScopeIds(patch.lookupScopeOptionalIds)
        : SETTINGS_DEFAULTS.lookupScopeOptionalIds
    ).filter((id) =>
      (
        Array.isArray(patch.lookupScopeIds)
          ? cleanFilterScopeIds(patch.lookupScopeIds)
          : SETTINGS_DEFAULTS.lookupScopeIds
      ).includes(id),
    ),
    lookupKinds: Array.isArray(patch.lookupKinds) ? cleanLookupKinds(patch.lookupKinds) : SETTINGS_DEFAULTS.lookupKinds,
    lookupModels: Array.isArray(patch.lookupModels)
      ? cleanLookupModels(patch.lookupModels)
      : SETTINGS_DEFAULTS.lookupModels,
    scopeSearch: 'scopeSearch' in patch ? cleanSearch(patch.scopeSearch) : SETTINGS_DEFAULTS.scopeSearch,
    modelsTab: 'modelsTab' in patch ? cleanModelsTab(patch.modelsTab) : SETTINGS_DEFAULTS.modelsTab,
    modelsKind: 'modelsKind' in patch ? cleanModelsKind(patch.modelsKind) : SETTINGS_DEFAULTS.modelsKind,
    civitaiBrowse: 'civitaiBrowse' in patch ? cleanCivitaiBrowse(patch.civitaiBrowse) : SETTINGS_DEFAULTS.civitaiBrowse,
    civitaiTabs: Array.isArray(patch.civitaiTabs) ? cleanCivitaiTabs(patch.civitaiTabs) : SETTINGS_DEFAULTS.civitaiTabs,
    civitaiTabId: cleanCivitaiTabId(
      'civitaiTabId' in patch ? patch.civitaiTabId : SETTINGS_DEFAULTS.civitaiTabId,
      Array.isArray(patch.civitaiTabs) ? cleanCivitaiTabs(patch.civitaiTabs) : SETTINGS_DEFAULTS.civitaiTabs,
    ),
    galleryTypes:
      patch.galleryTypes && typeof patch.galleryTypes === 'object' && !Array.isArray(patch.galleryTypes)
        ? cleanGalleryTypes(patch.galleryTypes)
        : SETTINGS_DEFAULTS.galleryTypes,
    galleryQuery:
      patch.galleryQuery && typeof patch.galleryQuery === 'object' && !Array.isArray(patch.galleryQuery)
        ? cleanQueryMap(patch.galleryQuery)
        : SETTINGS_DEFAULTS.galleryQuery,
    galleryLocalScopes:
      patch.galleryLocalScopes && typeof patch.galleryLocalScopes === 'object' && !Array.isArray(patch.galleryLocalScopes)
        ? cleanLocalScopes(patch.galleryLocalScopes)
        : SETTINGS_DEFAULTS.galleryLocalScopes,
    galleryScopeMode:
      patch.galleryScopeMode && typeof patch.galleryScopeMode === 'object'
        ? cleanModeMap(patch.galleryScopeMode)
        : SETTINGS_DEFAULTS.galleryScopeMode,
    galleryFilterMode:
      patch.galleryFilterMode && typeof patch.galleryFilterMode === 'object'
        ? cleanModeMap(patch.galleryFilterMode)
        : SETTINGS_DEFAULTS.galleryFilterMode,
    galleryFilterShareModels:
      typeof patch.galleryFilterShareModels === 'boolean'
        ? patch.galleryFilterShareModels
        : SETTINGS_DEFAULTS.galleryFilterShareModels,
    galleryPinSelected:
      patch.galleryPinSelected && typeof patch.galleryPinSelected === 'object'
        ? cleanGalleryPinSelected(patch.galleryPinSelected)
        : SETTINGS_DEFAULTS.galleryPinSelected,
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

export async function flushSettings() {
  window.clearTimeout(timer)
  await flush()
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
  setGenPreview: (genPreview) => {
    set({ genPreview })
    persist()
  },
  setGenPreviewEvery: (genPreviewEvery) => {
    set({ genPreviewEvery: cleanPreviewCount(genPreviewEvery, SETTINGS_DEFAULTS.genPreviewEvery) })
    persist()
  },
  setGenPreviewAfter: (genPreviewAfter) => {
    set({ genPreviewAfter: cleanPreviewCount(genPreviewAfter, SETTINGS_DEFAULTS.genPreviewAfter) })
    persist()
  },
  setGenPreviewAfterFirst: (genPreviewAfterFirst) => {
    set({ genPreviewAfterFirst })
    persist()
  },
  setGenPreviewLast: (genPreviewLast) => {
    set({ genPreviewLast })
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
  setCivitaiApiKey: (civitaiApiKey) => {
    set({ civitaiApiKey: civitaiApiKey.trim() })
    persist()
  },
  setCivitaiAutoRetry: (civitaiAutoRetry) => {
    set({ civitaiAutoRetry })
    persist()
  },
  setCivitaiAutoRetryCount: (civitaiAutoRetryCount) => {
    set({ civitaiAutoRetryCount: cleanPreviewCount(civitaiAutoRetryCount, SETTINGS_DEFAULTS.civitaiAutoRetryCount) })
    persist()
  },
  setTimeDisplay: (timeDisplay) => {
    set({ timeDisplay: cleanTimeDisplay(timeDisplay) })
    persist()
  },
  setSetResolutions: (setResolutions) => {
    set({ setResolutions: cleanSetResolutions(setResolutions) })
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
  setGridFormat: (gridFormat) => {
    set({ gridFormat: cleanImageFormat(gridFormat, SETTINGS_DEFAULTS.gridFormat) })
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
  setGallerySortKey: (key, gallerySortKey) => {
    const name = key.trim().slice(0, 80)
    if (!name) {
      return
    }
    set((state) => {
      const next = { ...state.gallerySortKey }
      const value = cleanSortKey(gallerySortKey)
      if (value === 'name') {
        delete next[name]
      } else {
        next[name] = value
      }
      return { gallerySortKey: next }
    })
    persist()
  },
  setGallerySortDir: (key, gallerySortDir) => {
    const name = key.trim().slice(0, 80)
    if (!name) {
      return
    }
    set((state) => {
      const next = { ...state.gallerySortDir }
      const value = cleanSortDir(gallerySortDir)
      if (value === 'asc') {
        delete next[name]
      } else {
        next[name] = value
      }
      return { gallerySortDir: next }
    })
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
  setLoraAutoApply: (loraAutoApply) => {
    set({ loraAutoApply })
    persist()
  },
  setLoraApplyAt: (loraApplyAt) => {
    set({ loraApplyAt: loraApplyAt === 'end' ? 'end' : 'start' })
    persist()
  },
  setModelDirs: (modelDirs) => {
    set((state) => {
      const nextDirs = ensureLocal(cleanDirs(modelDirs))
      return {
        modelDirs: nextDirs,
        civitaiDownload: cleanCivitaiDownload(state.civitaiDownload, nextDirs, state.wildcardDirs),
      }
    })
    persist()
  },
  setWildcardDirs: (wildcardDirs) => {
    set((state) => {
      const nextDirs = ensureLocal(cleanDirs(wildcardDirs))
      return {
        wildcardDirs: nextDirs,
        civitaiDownload: cleanCivitaiDownload(state.civitaiDownload, state.modelDirs, nextDirs),
      }
    })
    persist()
  },
  setGalleryDirs: (galleryDirs) => {
    set({ galleryDirs: cleanDirs(galleryDirs).filter((item) => item.id !== LOCAL_ID && item.id !== OUTPUT_ID) })
    persist()
  },
  setCivitaiDownload: (patch) => {
    set((state) => ({
      civitaiDownload: cleanCivitaiDownload(
        { ...state.civitaiDownload, ...patch },
        state.modelDirs,
        state.wildcardDirs,
      ),
    }))
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
  setAutocompleteEnabled: (autocompleteEnabled) => {
    set({ autocompleteEnabled })
    persist()
  },
  setAutocompleteMode: (autocompleteMode) => {
    set({ autocompleteMode })
    persist()
  },
  setAutocompleteTypes: (autocompleteTypes) => {
    set({ autocompleteTypes: cleanListTypes(autocompleteTypes) })
    persist()
  },
  setWildcardCompleteEnabled: (wildcardCompleteEnabled) => {
    set({ wildcardCompleteEnabled })
    persist()
  },
  setLoraCompleteEnabled: (loraCompleteEnabled) => {
    set({ loraCompleteEnabled })
    persist()
  },
  setLoraTriggerCompleteEnabled: (loraTriggerCompleteEnabled) => {
    set({ loraTriggerCompleteEnabled })
    persist()
  },
  setWildcardCompleteThumbs: (wildcardCompleteThumbs) => {
    set({ wildcardCompleteThumbs })
    persist()
  },
  setLoraCompleteThumbs: (loraCompleteThumbs) => {
    set({ loraCompleteThumbs })
    persist()
  },
  setAutocompleteThumbScale: (autocompleteThumbScale) => {
    set({ autocompleteThumbScale: cleanCompleteThumbScale(autocompleteThumbScale) })
    persist()
  },
  setFrequentTagsEnabled: (frequentTagsEnabled) => {
    set({ frequentTagsEnabled })
    persist()
  },
  setAutocompleteList: (name, patch) => {
    set((state) => {
      const prev = autocompleteListRule(state.autocompleteLists, name)
      const next: AutocompleteListRule = {
        enabled: patch.enabled ?? prev.enabled,
        mode: patch.mode ?? prev.mode,
        types: patch.types ?? prev.types,
      }
      const autocompleteLists = { ...state.autocompleteLists, [name]: next }
      if (
        next.enabled === AUTOCOMPLETE_LIST_DEFAULT.enabled &&
        next.mode === AUTOCOMPLETE_LIST_DEFAULT.mode &&
        next.types.length === 0
      ) {
        delete autocompleteLists[name]
      }
      return { autocompleteLists }
    })
    persist()
  },
  setGalleryThumbFallback: (galleryThumbFallback) => {
    set({ galleryThumbFallback })
    persist()
  },
  setThumbSaveTo: (thumbSaveTo) => {
    set({ thumbSaveTo: thumbSaveTo === 'global' ? 'global' : 'active' })
    persist()
  },
  setThumbDisplayMode: (thumbDisplayMode) => {
    set({ thumbDisplayMode: thumbDisplayMode === 'exact' ? 'exact' : 'likely' })
    persist()
  },
  setThumbScopeIds: (thumbScopeIds) => {
    set({ thumbScopeIds: cleanScopeIds(thumbScopeIds) })
    persist()
  },
  setThumbScopeOptionalIds: (thumbScopeOptionalIds) => {
    set({ thumbScopeOptionalIds: cleanScopeIds(thumbScopeOptionalIds) })
    persist()
  },
  setThumbScopeAuto: (thumbScopeAuto) => {
    set({ thumbScopeAuto })
    persist()
  },
  setTrashThumbFallback: (trashThumbFallback) => {
    set({ trashThumbFallback })
    persist()
  },
  setScopeGroups: (scopeGroups) => {
    set({ scopeGroups: cleanNames(scopeGroups) })
    persist()
  },
  setScopeOrder: (scopeOrder) => {
    set({ scopeOrder: cleanScopeIds(scopeOrder) })
    persist()
  },
  setLookupScopeIds: (lookupScopeIds) => {
    const next = cleanFilterScopeIds(lookupScopeIds)
    set((state) => ({
      lookupScopeIds: next,
      lookupScopeOptionalIds: state.lookupScopeOptionalIds.filter((id) => next.includes(id)),
    }))
    persist()
  },
  setLookupScopeOptionalIds: (lookupScopeOptionalIds) => {
    set((state) => ({
      lookupScopeOptionalIds: cleanScopeIds(lookupScopeOptionalIds).filter((id) => state.lookupScopeIds.includes(id)),
    }))
    persist()
  },
  setLookupKinds: (lookupKinds) => {
    set({ lookupKinds: cleanLookupKinds(lookupKinds) })
    persist()
  },
  setLookupModels: (lookupModels) => {
    set({ lookupModels: cleanLookupModels(lookupModels) })
    persist()
  },
  setScopeSearch: (scopeSearch) => {
    set({ scopeSearch: cleanSearch(scopeSearch) })
    persist()
  },
  setModelsTab: (modelsTab) => {
    set({ modelsTab: cleanModelsTab(modelsTab) })
    persist()
  },
  setModelsKind: (modelsKind) => {
    set({ modelsKind: cleanModelsKind(modelsKind) })
    persist()
  },
  setCivitaiBrowse: (patch) => {
    set((state) => ({ civitaiBrowse: cleanCivitaiBrowse({ ...state.civitaiBrowse, ...patch }) }))
    persist()
  },
  setCivitaiTabs: (civitaiTabs) => {
    set((state) => {
      const tabs = cleanCivitaiTabs(civitaiTabs)
      return { civitaiTabs: tabs, civitaiTabId: cleanCivitaiTabId(state.civitaiTabId, tabs) }
    })
    persist()
  },
  setCivitaiTabId: (civitaiTabId) => {
    set((state) => ({ civitaiTabId: cleanCivitaiTabId(civitaiTabId, state.civitaiTabs) }))
    persist()
  },
  setGalleryTypes: (key, value) => {
    const name = key.trim().slice(0, 80)
    if (!name) {
      return
    }
    set((state) => {
      const types = cleanTypeList(value)
      const galleryTypes = { ...state.galleryTypes }
      if (types.length) {
        galleryTypes[name] = types
      } else {
        delete galleryTypes[name]
      }
      return { galleryTypes }
    })
    persist()
  },
  setGalleryQuery: (key, value) => {
    const name = key.trim().slice(0, 80)
    if (!name) {
      return
    }
    set((state) => {
      const text = cleanSearch(value)
      const galleryQuery = { ...state.galleryQuery }
      if (text) {
        galleryQuery[name] = text
      } else {
        delete galleryQuery[name]
      }
      return { galleryQuery }
    })
    persist()
  },
  setGalleryLocalScope: (key, patch) => {
    if (!GALLERY_LOCAL_KEYS.has(key)) {
      return
    }
    set((state) => {
      const prev = state.galleryLocalScopes[key] ?? LOCAL_SCOPE_DEFAULT
      const next: GalleryLocalScope = {
        ids: patch.ids ? cleanScopeIds(patch.ids) : prev.ids,
        optionalIds: patch.optionalIds ? cleanScopeIds(patch.optionalIds) : prev.optionalIds,
        auto: patch.auto ?? prev.auto,
        mode: patch.mode ?? prev.mode,
        fallback: patch.fallback ?? prev.fallback,
      }
      const galleryLocalScopes = { ...state.galleryLocalScopes }
      if (emptyLocalScope(next)) {
        delete galleryLocalScopes[key]
      } else {
        galleryLocalScopes[key] = next
      }
      return { galleryLocalScopes }
    })
    persist()
  },
  dropGalleryLocalScopeId: (id) => {
    if (!id) {
      return
    }
    set((state) => {
      const galleryLocalScopes: Record<string, GalleryLocalScope> = {}
      for (const [key, pack] of Object.entries(state.galleryLocalScopes)) {
        const next: GalleryLocalScope = {
          ...pack,
          ids: pack.ids.filter((item) => item !== id),
          optionalIds: pack.optionalIds.filter((item) => item !== id),
        }
        if (!emptyLocalScope(next)) {
          galleryLocalScopes[key] = next
        }
      }
      return { galleryLocalScopes }
    })
    persist()
  },
  setGalleryScopeMode: (key, value) => {
    set((state) => {
      const scope = cleanFilterScope(value, GALLERY_MODE_DEFAULTS[key])
      const galleryScopeMode = { ...state.galleryScopeMode }
      if (scope === GALLERY_MODE_DEFAULTS[key]) {
        delete galleryScopeMode[key]
      } else {
        galleryScopeMode[key] = scope
      }
      return { galleryScopeMode }
    })
    persist()
  },
  setGalleryFilterMode: (key, value) => {
    set((state) => {
      const scope = cleanFilterScope(value, GALLERY_MODE_DEFAULTS[key])
      const galleryFilterMode = { ...state.galleryFilterMode }
      if (scope === GALLERY_MODE_DEFAULTS[key]) {
        delete galleryFilterMode[key]
      } else {
        galleryFilterMode[key] = scope
      }
      return { galleryFilterMode }
    })
    persist()
  },
  setGalleryFilterShareModels: (galleryFilterShareModels) => {
    set({ galleryFilterShareModels })
    persist()
  },
  setGalleryPinSelected: (key, value) => {
    set((state) => {
      const galleryPinSelected = { ...state.galleryPinSelected }
      if (value) {
        delete galleryPinSelected[key]
      } else {
        galleryPinSelected[key] = false
      }
      return { galleryPinSelected }
    })
    persist()
  },
}))
