import { LOCAL_ID } from '@/components/primitives/FolderList.tsx'
import { defaultHiddenModelTypes } from '@/lib/modelTypes.ts'
import { GENERATE_TABS, type GenerateTab } from '@/screens/generate/tabs.ts'
import {
  ORDERABLE_MAIN_TABS,
  type HideableMainTab,
  type OrderableMainTab,
} from '@/app/appTabs.ts'
import { type TimeDisplay } from '@/lib/timeDisplay.ts'
import { defaultCivitaiMarks } from '@/lib/civitai/marks.ts'
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
export const GALLERY_SORT_KEY_DEFAULT: GallerySortKey = 'added'
export const GALLERY_SORT_DIR_DEFAULT: GallerySortDir = 'desc'
export type GalleryFilterScope = 'global' | 'local'

export const GALLERY_BROWSE_KINDS = ['checkpoints', 'loras', 'wildcards'] as const
export const LOOKUP_GROUPS = [
  { id: 'checkpoints' as const, label: 'Base Model', kinds: ['checkpoints', 'diffusion_models'] },
  { id: 'loras' as const, label: 'LoRA', kinds: ['loras'] },
  { id: 'wildcards' as const, label: 'Wildcards', kinds: ['wildcards'] },
  { id: 'other' as const, label: 'Other', kinds: ['vae', 'text_encoders', 'controlnet', 'embeddings'] },
] as const
export type LookupKind = (typeof LOOKUP_GROUPS)[number]['id']
export const LOOKUP_KINDS = LOOKUP_GROUPS.map((item) => item.id)

export function lookupGroupFor(kind: string): LookupKind | undefined {
  const group = LOOKUP_GROUPS.find((item) => item.id === kind || (item.kinds as readonly string[]).includes(kind))
  return group?.id
}

export type GalleryBrowseKind = (typeof GALLERY_BROWSE_KINDS)[number]
export type GalleryBrowseSort = 'recent' | 'works'
export const GALLERY_BROWSE_SORT_DEFAULT: GalleryBrowseSort = 'recent'
export const GALLERY_BROWSE_DIR_DEFAULT: GallerySortDir = 'desc'

export function galleryBrowseKey(kind: GalleryBrowseKind, share: boolean) {
  return share ? 'global' : kind
}

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

export const GALLERY_MODE_KEYS = [
  ...GENERATE_FILTER_VIEWS.map((item) => item.key),
  ...MODELS_FILTER_VIEWS.map((item) => item.key),
] as const
export type GalleryModeKey = (typeof GALLERY_MODE_KEYS)[number]

export function galleryModeDefault(viewKey: string): GalleryFilterScope {
  return viewKey.startsWith('models') ? 'global' : 'local'
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
  fallback: true,
}

export const GALLERY_LOCAL_KEYS = new Set<string>([
  ...GENERATE_FILTER_VIEWS.map((item) => item.key),
  'models',
  ...MODELS_FILTER_VIEWS.map((item) => item.key),
])
export const GALLERY_FILTER_KEYS = new Set<string>(['global', ...GALLERY_LOCAL_KEYS])
export const GALLERY_MODE_KEY_SET = new Set<string>(GALLERY_MODE_KEYS)

export function galleryModeKey(viewKey: string): GalleryModeKey {
  if (viewKey === 'loras' || viewKey === 'wildcards' || viewKey === 'other') {
    return viewKey
  }
  if (GALLERY_MODE_KEY_SET.has(viewKey)) {
    return viewKey as GalleryModeKey
  }
  if (viewKey.startsWith('models')) {
    return 'models-all'
  }
  return 'checkpoints'
}

export function galleryModeValue(
  map: Record<string, GalleryFilterScope>,
  viewKey: string,
): GalleryFilterScope {
  const key = galleryModeKey(viewKey)
  return map[key] ?? galleryModeDefault(key)
}

export function galleryShareKey(viewKey: string): string {
  return galleryModeKey(viewKey).startsWith('models') ? 'models' : 'global'
}

export function isGenerateGallery(viewKey: string): boolean {
  return !galleryModeKey(viewKey).startsWith('models')
}

function galleryStoreKey(viewKey: string, modeMap: Record<string, GalleryFilterScope>): string {
  const key = galleryModeKey(viewKey)
  if (galleryModeValue(modeMap, key) === 'global') {
    return galleryShareKey(key)
  }
  return key
}

export function galleryFilterKey(viewKey: string, state: { galleryFilterMode: Record<string, GalleryFilterScope> }): string {
  return galleryStoreKey(viewKey, state.galleryFilterMode)
}

export function galleryScopeKey(viewKey: string, state: { galleryScopeMode: Record<string, GalleryFilterScope> }): string {
  return galleryStoreKey(viewKey, state.galleryScopeMode)
}

export const IMAGE_FORMATS = [
  { value: 'png', label: 'PNG' },
  { value: 'jpg', label: 'JPEG' },
  { value: 'webp', label: 'WebP' },
] as const
export type ImageFormat = (typeof IMAGE_FORMATS)[number]['value']

export const ANIMATED_THUMB_FORMATS = [
  { value: 'gif', label: 'GIF' },
  { value: 'webp', label: 'WebP' },
  { value: 'video', label: 'Video' },
] as const
export type AnimatedThumbFormat = (typeof ANIMATED_THUMB_FORMATS)[number]['value']

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
  saveRawThumbs: true,
  saveAnimatedThumbs: true,
  animatedThumbFormat: 'webp' as AnimatedThumbFormat,
  downloadThumbMegapixels: 0.25,
  downloadThumbImageFormat: 'jpg' as ImageFormat,
  downloadThumbVideoFormat: 'webp' as AnimatedThumbFormat,
  downloadThumbQuality: 85,
  galleryItemThumbMegapixels: 0.5,
  galleryItemThumbFormat: 'jpg' as ImageFormat,
  galleryItemThumbVideoFormat: 'webp' as AnimatedThumbFormat,
  galleryItemThumbQuality: 85,
  galleryPageSize: 200,
  downloadHistoryLimit: -1,
  browseHistoryLimit: 500,
  civitaiMarks: defaultCivitaiMarks(),
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
  downloadQueue: true,
  downloadQueueParallel: 10,
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
  galleryThumbFallback: true,
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
  galleryAutoTypes: {} as Record<string, boolean>,
  galleryPinSelected: {} as Record<string, boolean>,
  galleryBrowseSort: {} as Record<string, GalleryBrowseSort>,
  galleryBrowseDir: {} as Record<string, GallerySortDir>,
  galleryBrowseShare: false,
}
