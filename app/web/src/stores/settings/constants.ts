import { LOCAL_ID } from '@/components/primitives/FolderList.tsx'
import { defaultHiddenModelTypes } from '@/lib/modelTypes.ts'
import { GENERATE_TABS, type GenerateTab } from '@/screens/generate/tabs.ts'
import {
  ORDERABLE_MAIN_TABS,
  type HideableMainTab,
  type OrderableMainTab,
} from '@/app/appTabs.ts'
import { type TimeDisplay } from '@/lib/timeDisplay.ts'
import { DEFAULT_SET_RESOLUTIONS } from '@/screens/generate/resolutions.ts'
import { CIVITAI_BROWSE_DEFAULT } from '@/lib/civitai/browse.ts'
import { type CivitaiTab } from '@/lib/civitai/version.ts'
import { CIVITAI_DOWNLOAD_DEFAULT } from '@/lib/civitai/download.ts'
import type { FolderDir } from '@/lib/api.ts'

export const THEMES = [
  { value: 'darker', label: 'Default' },
  { value: 'slate', label: 'Slate' },
  { value: 'midnight', label: 'Midnight' },
  { value: 'ember', label: 'Ember' },
  { value: 'moss', label: 'Moss' },
  { value: 'light', label: 'Light' },
] as const

export type Theme = (typeof THEMES)[number]['value']
export const THEME_IDS = new Set<string>(THEMES.map((item) => item.value))

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

export const GALLERY_VIEWS = ['checkpoints', 'loras', 'wildcards', 'other'] as const
export type GalleryViewKind = (typeof GALLERY_VIEWS)[number]
export type GallerySortKey = 'name' | 'added' | 'edited' | 'path'
export type GallerySortDir = 'asc' | 'desc'
export type GalleryFilterScope = 'global' | 'local'

export const GENERATE_FILTER_VIEWS = [
  { key: 'checkpoints', label: 'Base Model' },
  { key: 'loras', label: 'LoRA' },
  { key: 'wildcards', label: 'Wildcards' },
  { key: 'other', label: 'Other' },
] as const

export const MODELS_FILTER_VIEWS = [
  { key: 'models-all', label: 'All' },
  { key: 'models-checkpoints', label: 'Base Model' },
  { key: 'models-loras', label: 'LoRA' },
  { key: 'models-wildcards', label: 'Wildcards' },
  { key: 'models-other', label: 'Other' },
] as const

export const GALLERY_MODE_KEYS = ['checkpoints', 'loras', 'wildcards', 'other', 'models'] as const
export type GalleryModeKey = (typeof GALLERY_MODE_KEYS)[number]

export const GALLERY_MODE_DEFAULTS: Record<GalleryModeKey, GalleryFilterScope> = {
  checkpoints: 'global',
  loras: 'global',
  wildcards: 'global',
  other: 'global',
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

export const GALLERY_LOCAL_KEYS = new Set<string>([
  ...GENERATE_FILTER_VIEWS.map((item) => item.key),
  'models',
  ...MODELS_FILTER_VIEWS.map((item) => item.key),
])
export const GALLERY_FILTER_KEYS = new Set<string>(['global', ...GALLERY_LOCAL_KEYS])
export const GALLERY_MODE_KEY_SET = new Set<string>(GALLERY_MODE_KEYS)

export function galleryModeKey(viewKey: string): GalleryModeKey {
  if (viewKey.startsWith('models')) {
    return 'models'
  }
  if (viewKey === 'loras' || viewKey === 'wildcards' || viewKey === 'other') {
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

function galleryStoreKey(viewKey: string, modeMap: Record<string, GalleryFilterScope>, shareModels: boolean): string {
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
  state: { galleryFilterMode: Record<string, GalleryFilterScope>; galleryFilterShareModels: boolean },
): string {
  return galleryStoreKey(viewKey, state.galleryFilterMode, state.galleryFilterShareModels)
}

export function galleryScopeKey(
  viewKey: string,
  state: { galleryScopeMode: Record<string, GalleryFilterScope>; galleryFilterShareModels: boolean },
): string {
  return galleryStoreKey(viewKey, state.galleryScopeMode, state.galleryFilterShareModels)
}

export const IMAGE_FORMATS = [
  { value: 'png', label: 'PNG' },
  { value: 'jpg', label: 'JPEG' },
  { value: 'webp', label: 'WebP' },
] as const
export type ImageFormat = (typeof IMAGE_FORMATS)[number]['value']

export type AutocompleteMode = 'exclude' | 'include'
export type AutocompleteListRule = { enabled: boolean; mode: AutocompleteMode; types: string[] }
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
  thumbMegapixels: 0.25,
  thumbFormat: 'jpg' as ImageFormat,
  thumbQuality: 85,
  saveRawThumbs: false,
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
  modelsKind: 'all' as 'all' | 'checkpoints' | 'loras' | 'wildcards' | 'other',
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
