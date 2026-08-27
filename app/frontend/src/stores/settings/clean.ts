import { OTHER_KIND_IDS } from '@/components/composites/gallery/galleryUtils.ts'
import { MODEL_TYPES } from '@/lib/modelTypes.ts'
import { generateTabOrderList, type GenerateTab } from '@/views/generate/panels/workspace/tabs.ts'
import {
  GALLERY_BROWSE_DIR_DEFAULT,
  GALLERY_BROWSE_KINDS,
  GALLERY_BROWSE_SORT_DEFAULT,
  GALLERY_FILTER_KEYS,
  GALLERY_LOCAL_KEYS,
  GALLERY_MODE_KEY_SET,
  GALLERY_SORT_DIR_DEFAULT,
  GALLERY_SORT_KEY_DEFAULT,
  galleryModeDefault,
  IMAGE_FORMATS,
  lookupGroupFor,
  SETTINGS_DEFAULTS,
  THEME_IDS,
  type AutocompleteListRule,
  type AnimatedThumbFormat,
  type GalleryBrowseSort,
  type GalleryFilterScope,
  type GalleryLocalScope,
  type GallerySortDir,
  type GallerySortKey,
  type ImageFormat,
  type Theme,
} from './constants.ts'
import {
  HIDEABLE_MAIN_TABS,
  mergeOrder,
  ORDERABLE_MAIN_TABS,
  type HideableMainTab,
  type OrderableMainTab,
} from '@/app/appTabs.ts'
import { cleanSetResolutions } from '@/views/generate/panels/generation/sections/params/resolutions.ts'
import { cleanCivitaiBrowse } from '@/lib/civitai/browse.ts'
import { cleanCivitaiMarks } from '@/lib/civitai/marks.ts'
import { cleanCivitaiTabId, cleanCivitaiTabs } from '@/lib/civitai/version.ts'
import { cleanCivitaiDownload } from '@/lib/civitai/download.ts'
import type { FolderDir, UserSettings } from '@/lib/api.ts'
import { LOCAL_ID, OUTPUT_ID } from '@/components/controls/folder-list/FolderList.tsx'

const IMAGE_FORMAT_IDS = new Set<string>(IMAGE_FORMATS.map((item) => item.value))
const SORT_KEYS = new Set<string>(['name', 'added', 'edited', 'path'])

export function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function cleanTabs(raw: unknown): GenerateTab[] {
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

export function cleanHiddenMainTabs(raw: unknown): HideableMainTab[] {
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

export function cleanMainTabOrder(raw: unknown): OrderableMainTab[] {
  if (!Array.isArray(raw)) {
    return SETTINGS_DEFAULTS.mainTabOrder
  }
  return mergeOrder(raw.map(String), ORDERABLE_MAIN_TABS)
}

export function cleanGenerateTabOrder(raw: unknown): GenerateTab[] {
  if (!Array.isArray(raw)) {
    return SETTINGS_DEFAULTS.generateTabOrder
  }
  return generateTabOrderList(raw.map(String))
}

export function cleanNames(raw: unknown): string[] {
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

export function cleanImageFormat(raw: unknown, fallback: ImageFormat = SETTINGS_DEFAULTS.imageFormat): ImageFormat {
  const name = raw === 'jpeg' ? 'jpg' : raw
  return IMAGE_FORMAT_IDS.has(name as string) ? (name as ImageFormat) : fallback
}

export function cleanImageQuality(raw: unknown, fallback = SETTINGS_DEFAULTS.imageQuality) {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) {
    return fallback
  }
  return Math.max(1, Math.min(100, Math.round(n)))
}

export function cleanThumbMegapixels(raw: unknown) {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) {
    return SETTINGS_DEFAULTS.thumbMegapixels
  }
  return Math.round(Math.min(2, Math.max(0.05, n)) * 20) / 20
}

export function cleanAnimatedThumbFormat(raw: unknown): AnimatedThumbFormat {
  return raw === 'gif' || raw === 'video' || raw === 'webp' ? raw : SETTINGS_DEFAULTS.animatedThumbFormat
}

export function cleanDownloadQueueParallel(raw: unknown) {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) {
    return SETTINGS_DEFAULTS.downloadQueueParallel
  }
  return Math.max(1, Math.min(20, Math.round(n)))
}

export function cleanHistoryLimit(raw: unknown, fallback: number) {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) {
    return fallback
  }
  const value = Math.trunc(n)
  return value < -1 ? fallback : value
}

export function cleanGalleryPageSize(raw: unknown) {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) {
    return SETTINGS_DEFAULTS.galleryPageSize
  }
  return Math.max(20, Math.min(500, Math.round(n)))
}

export function cleanLargeJpegMaxKb(raw: unknown) {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) {
    return SETTINGS_DEFAULTS.largeJpegMaxKb
  }
  return Math.max(256, Math.min(65536, Math.round(n)))
}

export function cleanRemovedHours(raw: unknown) {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) {
    return SETTINGS_DEFAULTS.removedAfterHours
  }
  return Math.max(1, Math.min(8760, Math.round(n)))
}

export function cleanRemovedMaxGb(raw: unknown) {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) {
    return SETTINGS_DEFAULTS.removedMaxGb
  }
  return Math.max(1, Math.min(10000, Math.round(n)))
}

export function cleanTypes(raw: unknown): string[] {
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

export function cleanListTypes(raw: unknown): string[] {
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

export function cleanScopeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const out: string[] = []
  for (const item of raw) {
    const name = String(item).trim().toLowerCase()
    if (!name || name === 'global' || out.includes(name) || !/^[a-f0-9]{12}$/.test(name)) {
      continue
    }
    out.push(name)
  }
  return out
}

export function cleanFilterScopeIds(raw: unknown): string[] {
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
    if (/^[a-f0-9]{12}$/.test(name)) {
      out.push(name)
    }
  }
  return out
}

export function cleanLookupKinds(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const out: string[] = []
  for (const item of raw) {
    const group = lookupGroupFor(String(item))
    if (group && !out.includes(group)) {
      out.push(group)
    }
  }
  return out
}

export function cleanLookupModels(raw: unknown): string[] {
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

export function cleanSearch(raw: unknown): string {
  return typeof raw === 'string' ? raw.slice(0, 200) : ''
}

export function cleanModelsTab(raw: unknown): 'Local' | 'CivitAI' | 'Manager' {
  if (raw === 'CivitAI' || raw === 'Download') {
    return 'CivitAI'
  }
  return raw === 'Manager' ? 'Manager' : 'Local'
}

export function cleanModelsKind(raw: unknown): 'all' | 'checkpoints' | 'loras' | 'wildcards' | 'other' {
  return raw === 'checkpoints' || raw === 'loras' || raw === 'wildcards' || raw === 'other' || raw === 'all'
    ? raw
    : 'all'
}

export function cleanTypeList(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const allowed = new Set<string>([...MODEL_TYPES, ...OTHER_KIND_IDS])
  const out: string[] = []
  for (const item of raw) {
    const name = String(item)
    if (allowed.has(name) && !out.includes(name)) {
      out.push(name)
    }
  }
  return out
}

export function cleanGalleryTypes(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const out: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const name = key.trim().slice(0, 80)
    if (name) {
      out[name] = cleanTypeList(value)
    }
  }
  return out
}

export function cleanFilterScope(raw: unknown, fallback: GalleryFilterScope): GalleryFilterScope {
  return raw === 'global' || raw === 'local' ? raw : fallback
}

export function cleanModeMap(raw: unknown): Record<string, GalleryFilterScope> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const out: Record<string, GalleryFilterScope> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!GALLERY_MODE_KEY_SET.has(key) || (value !== 'global' && value !== 'local')) {
      continue
    }
    if (value !== galleryModeDefault(key)) {
      out[key] = value
    }
  }
  return out
}

export function cleanGalleryPinSelected(raw: unknown): Record<string, boolean> {
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

export function emptyLocalScope(pack: GalleryLocalScope) {
  return pack.ids.length === 0 && pack.optionalIds.length === 0 && !pack.auto && pack.mode === 'likely' && pack.fallback
}

export function cleanLocalScope(raw: unknown): GalleryLocalScope | null {
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

export function cleanLocalScopes(raw: unknown): Record<string, GalleryLocalScope> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const out: Record<string, GalleryLocalScope> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const pack = GALLERY_LOCAL_KEYS.has(key) ? cleanLocalScope(value) : null
    if (pack) {
      out[key] = pack
    }
  }
  return out
}

export function cleanQueryMap(raw: unknown): Record<string, string> {
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

export function cleanFallback(raw: unknown): boolean {
  if (typeof raw === 'boolean') {
    return raw
  }
  if (!raw || typeof raw !== 'object') {
    return SETTINGS_DEFAULTS.galleryThumbFallback
  }
  const row = raw as Record<string, unknown>
  return Boolean(row.checkpoints || row.loras || row.wildcards)
}

export function cleanAutocompleteLists(raw: unknown): Record<string, AutocompleteListRule> {
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
      enabled: typeof row.enabled === 'boolean' ? row.enabled : true,
      mode: row.mode === 'include' ? 'include' : 'exclude',
      types: cleanListTypes(row.types),
    }
  }
  return out
}

export function cleanTheme(raw: unknown): Theme {
  const name = raw === 'default' ? 'slate' : raw
  return THEME_IDS.has(name as string) ? (name as Theme) : SETTINGS_DEFAULTS.theme
}

export function cleanCivitaiSite(raw: unknown) {
  return raw === 'civitai' ? 'civitai' : SETTINGS_DEFAULTS.civitaiSite
}

export function cleanTimeDisplay(raw: unknown) {
  return raw === 'ampm' ? 'ampm' : SETTINGS_DEFAULTS.timeDisplay
}

export function cleanPath(raw: unknown, fallback: string) {
  if (typeof raw !== 'string') {
    return fallback
  }
  const text = raw.trim().replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
  return text || fallback
}

export function cleanName(raw: unknown, fallback: string) {
  if (typeof raw !== 'string') {
    return fallback
  }
  const text = raw.trim().replaceAll('\\', '/').split('/').pop() ?? ''
  return text || fallback
}

export function cleanSortKey(raw: unknown): GallerySortKey {
  return SORT_KEYS.has(raw as string) ? (raw as GallerySortKey) : GALLERY_SORT_KEY_DEFAULT
}

export function cleanSortDir(raw: unknown): GallerySortDir {
  return raw === 'asc' ? 'asc' : GALLERY_SORT_DIR_DEFAULT
}

export function cleanSortKeyMap(raw: unknown): Record<string, GallerySortKey> {
  if (typeof raw === 'string') {
    const value = cleanSortKey(raw)
    return value === GALLERY_SORT_KEY_DEFAULT ? {} : { checkpoints: value, loras: value, wildcards: value }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const out: Record<string, GallerySortKey> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const name = key.trim().slice(0, 80)
    const sort = cleanSortKey(value)
    if (name && sort !== GALLERY_SORT_KEY_DEFAULT) {
      out[name] = sort
    }
  }
  return out
}

export function cleanSortDirMap(raw: unknown): Record<string, GallerySortDir> {
  if (typeof raw === 'string') {
    const value = cleanSortDir(raw)
    return value === GALLERY_SORT_DIR_DEFAULT ? {} : { checkpoints: value, loras: value, wildcards: value }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const out: Record<string, GallerySortDir> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const name = key.trim().slice(0, 80)
    const dir = cleanSortDir(value)
    if (name && dir !== GALLERY_SORT_DIR_DEFAULT) {
      out[name] = dir
    }
  }
  return out
}

const BROWSE_KEYS = new Set<string>([...GALLERY_BROWSE_KINDS, 'global'])

export function cleanBrowseSort(raw: unknown): GalleryBrowseSort {
  return raw === 'works' ? 'works' : GALLERY_BROWSE_SORT_DEFAULT
}

export function cleanBrowseSortMap(raw: unknown): Record<string, GalleryBrowseSort> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const out: Record<string, GalleryBrowseSort> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const name = key.trim()
    const sort = cleanBrowseSort(value)
    if (BROWSE_KEYS.has(name) && sort !== GALLERY_BROWSE_SORT_DEFAULT) {
      out[name] = sort
    }
  }
  return out
}

export function cleanBrowseDirMap(raw: unknown): Record<string, GallerySortDir> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const out: Record<string, GallerySortDir> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const name = key.trim()
    const dir = cleanSortDir(value)
    if (BROWSE_KEYS.has(name) && dir !== GALLERY_BROWSE_DIR_DEFAULT) {
      out[name] = dir
    }
  }
  return out
}

export function cleanCompleteThumbScale(raw: unknown) {
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? Math.round(Math.min(2, Math.max(0.5, n)) * 10) / 10 : SETTINGS_DEFAULTS.autocompleteThumbScale
}

export function cleanTileScale(raw: unknown) {
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? Math.round(Math.min(2, Math.max(0.5, n)) * 10) / 10 : SETTINGS_DEFAULTS.galleryTileScale
}

export function cleanPromptWeightStep(raw: unknown) {
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? Math.round(Math.min(1, Math.max(0.01, n)) * 100) / 100 : SETTINGS_DEFAULTS.promptWeightStep
}

export function cleanPreviewCount(raw: unknown, fallback: number) {
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? Math.max(1, Math.min(150, Math.round(n))) : fallback
}

export function cleanLoraBound(raw: unknown, fallback: number) {
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? Math.round(Math.min(20, Math.max(-20, n)) * 100) / 100 : fallback
}

export function cleanDirs(raw: unknown): FolderDir[] {
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
    if (!id || !name || seen.has(id) || name.includes('/') || name.includes('\\')) {
      continue
    }
    seen.add(id)
    out.push({ id, name: id === LOCAL_ID ? 'Local' : name, path: id === LOCAL_ID ? '' : path })
  }
  return out
}

export function ensureLocal(items: FolderDir[]): FolderDir[] {
  const extras = items.filter((item) => item.id !== LOCAL_ID)
  const index = items.findIndex((item) => item.id === LOCAL_ID)
  const local: FolderDir = { id: LOCAL_ID, name: 'Local', path: '' }
  return index < 0 ? [local, ...extras] : items.map((item, i) => (i === index ? local : item))
}

export function applyPatch(patch: UserSettings): typeof SETTINGS_DEFAULTS {
  const modelDirs = Array.isArray(patch.modelDirs) ? ensureLocal(cleanDirs(patch.modelDirs)) : SETTINGS_DEFAULTS.modelDirs
  const wildcardDirs = Array.isArray(patch.wildcardDirs) ? ensureLocal(cleanDirs(patch.wildcardDirs)) : SETTINGS_DEFAULTS.wildcardDirs
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
    modelInfoLayout: patch.modelInfoLayout === 'vertical' ? 'vertical' : SETTINGS_DEFAULTS.modelInfoLayout,
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
    hiresPath: cleanPath(patch.hiresPath, SETTINGS_DEFAULTS.hiresPath),
    imageName: cleanName(patch.imageName, SETTINGS_DEFAULTS.imageName),
    gridName: cleanName(patch.gridName, SETTINGS_DEFAULTS.gridName),
    hiresName: cleanName(patch.hiresName, SETTINGS_DEFAULTS.hiresName),
    imageFormat: patch.imageFormat ? cleanImageFormat(patch.imageFormat) : SETTINGS_DEFAULTS.imageFormat,
    gridFormat: patch.gridFormat ? cleanImageFormat(patch.gridFormat, SETTINGS_DEFAULTS.gridFormat) : SETTINGS_DEFAULTS.gridFormat,
    imageQuality: typeof patch.imageQuality === 'number' ? cleanImageQuality(patch.imageQuality) : SETTINGS_DEFAULTS.imageQuality,
    saveLargeAsJpeg: typeof patch.saveLargeAsJpeg === 'boolean' ? patch.saveLargeAsJpeg : SETTINGS_DEFAULTS.saveLargeAsJpeg,
    largeJpegMaxKb:
      typeof patch.largeJpegMaxKb === 'number' ? cleanLargeJpegMaxKb(patch.largeJpegMaxKb) : SETTINGS_DEFAULTS.largeJpegMaxKb,
    thumbMegapixels:
      typeof patch.thumbMegapixels === 'number' ? cleanThumbMegapixels(patch.thumbMegapixels) : SETTINGS_DEFAULTS.thumbMegapixels,
    thumbFormat: patch.thumbFormat
      ? cleanImageFormat(patch.thumbFormat, SETTINGS_DEFAULTS.thumbFormat)
      : SETTINGS_DEFAULTS.thumbFormat,
    thumbQuality:
      typeof patch.thumbQuality === 'number'
        ? cleanImageQuality(patch.thumbQuality, SETTINGS_DEFAULTS.thumbQuality)
        : SETTINGS_DEFAULTS.thumbQuality,
    saveRawThumbs: typeof patch.saveRawThumbs === 'boolean' ? patch.saveRawThumbs : SETTINGS_DEFAULTS.saveRawThumbs,
    saveAnimatedThumbs:
      typeof patch.saveAnimatedThumbs === 'boolean' ? patch.saveAnimatedThumbs : SETTINGS_DEFAULTS.saveAnimatedThumbs,
    animatedThumbFormat: patch.animatedThumbFormat
      ? cleanAnimatedThumbFormat(patch.animatedThumbFormat)
      : SETTINGS_DEFAULTS.animatedThumbFormat,
    downloadThumbMegapixels:
      typeof patch.downloadThumbMegapixels === 'number'
        ? cleanThumbMegapixels(patch.downloadThumbMegapixels)
        : SETTINGS_DEFAULTS.downloadThumbMegapixels,
    downloadThumbImageFormat: patch.downloadThumbImageFormat
      ? cleanImageFormat(patch.downloadThumbImageFormat, SETTINGS_DEFAULTS.downloadThumbImageFormat)
      : SETTINGS_DEFAULTS.downloadThumbImageFormat,
    downloadThumbVideoFormat: patch.downloadThumbVideoFormat
      ? cleanAnimatedThumbFormat(patch.downloadThumbVideoFormat)
      : SETTINGS_DEFAULTS.downloadThumbVideoFormat,
    downloadThumbQuality:
      typeof patch.downloadThumbQuality === 'number'
        ? cleanImageQuality(patch.downloadThumbQuality, SETTINGS_DEFAULTS.downloadThumbQuality)
        : SETTINGS_DEFAULTS.downloadThumbQuality,
    galleryItemThumbMegapixels:
      typeof patch.galleryItemThumbMegapixels === 'number'
        ? cleanThumbMegapixels(patch.galleryItemThumbMegapixels)
        : SETTINGS_DEFAULTS.galleryItemThumbMegapixels,
    galleryItemThumbFormat: patch.galleryItemThumbFormat
      ? cleanImageFormat(patch.galleryItemThumbFormat, SETTINGS_DEFAULTS.galleryItemThumbFormat)
      : SETTINGS_DEFAULTS.galleryItemThumbFormat,
    galleryItemThumbVideoFormat: patch.galleryItemThumbVideoFormat
      ? cleanAnimatedThumbFormat(patch.galleryItemThumbVideoFormat)
      : SETTINGS_DEFAULTS.galleryItemThumbVideoFormat,
    galleryItemThumbQuality:
      typeof patch.galleryItemThumbQuality === 'number'
        ? cleanImageQuality(patch.galleryItemThumbQuality, SETTINGS_DEFAULTS.galleryItemThumbQuality)
        : SETTINGS_DEFAULTS.galleryItemThumbQuality,
    galleryPageSize:
      typeof patch.galleryPageSize === 'number'
        ? cleanGalleryPageSize(patch.galleryPageSize)
        : SETTINGS_DEFAULTS.galleryPageSize,
    downloadHistoryLimit: cleanHistoryLimit(patch.downloadHistoryLimit, SETTINGS_DEFAULTS.downloadHistoryLimit),
    browseHistoryLimit: cleanHistoryLimit(patch.browseHistoryLimit, SETTINGS_DEFAULTS.browseHistoryLimit),
    civitaiMarks: 'civitaiMarks' in patch ? cleanCivitaiMarks(patch.civitaiMarks) : SETTINGS_DEFAULTS.civitaiMarks,
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
    downloadQueue: typeof patch.downloadQueue === 'boolean' ? patch.downloadQueue : SETTINGS_DEFAULTS.downloadQueue,
    downloadQueueParallel:
      typeof patch.downloadQueueParallel === 'number'
        ? cleanDownloadQueueParallel(patch.downloadQueueParallel)
        : SETTINGS_DEFAULTS.downloadQueueParallel,
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
    galleryAutoTypes:
      patch.galleryAutoTypes && typeof patch.galleryAutoTypes === 'object'
        ? cleanGalleryPinSelected(patch.galleryAutoTypes)
        : SETTINGS_DEFAULTS.galleryAutoTypes,
    galleryPinSelected:
      patch.galleryPinSelected && typeof patch.galleryPinSelected === 'object'
        ? cleanGalleryPinSelected(patch.galleryPinSelected)
        : SETTINGS_DEFAULTS.galleryPinSelected,
    galleryBrowseSort:
      patch.galleryBrowseSort && typeof patch.galleryBrowseSort === 'object'
        ? cleanBrowseSortMap(patch.galleryBrowseSort)
        : SETTINGS_DEFAULTS.galleryBrowseSort,
    galleryBrowseDir:
      patch.galleryBrowseDir && typeof patch.galleryBrowseDir === 'object'
        ? cleanBrowseDirMap(patch.galleryBrowseDir)
        : SETTINGS_DEFAULTS.galleryBrowseDir,
    galleryBrowseShare: typeof patch.galleryBrowseShare === 'boolean' ? patch.galleryBrowseShare : SETTINGS_DEFAULTS.galleryBrowseShare,
  }
}
