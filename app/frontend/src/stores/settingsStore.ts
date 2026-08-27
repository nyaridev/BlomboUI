import { create } from 'zustand'
import { getSettings, saveSettings, type UserSettings } from '@/lib/api.ts'
import { type CivitaiBrowse } from '@/lib/civitai/browse.ts'
import { type CivitaiMarks } from '@/lib/civitai/marks.ts'
import { type CivitaiDownloadSettings } from '@/lib/civitai/download.ts'
import { type CivitaiTab } from '@/lib/civitai/version.ts'
import { type GenerateTab } from '@/views/generate/panels/workspace/tabs.ts'
import { type TimeDisplay } from '@/lib/timeDisplay.ts'
import type { FolderDir } from '@/lib/api.ts'
import type { HideableMainTab, OrderableMainTab } from '@/app/appTabs.ts'
import {
  SETTINGS_DEFAULTS,
  type AutocompleteListRule,
  type AutocompleteMode,
  type CivitaiSite,
  type GalleryFilterScope,
  type GalleryLocalScope,
  type GalleryModeKey,
  type GalleryBrowseKind,
  type GalleryBrowseSort,
  type GallerySortDir,
  type GallerySortKey,
  type AnimatedThumbFormat,
  type ImageFormat,
  type Theme,
} from './settings/constants.ts'
import { applyPatch, same } from './settings/clean.ts'
import { applySettingReset, type SettingsKey } from './settings/reset.ts'
import { createGenerateActions } from './settings/actionsGenerate.ts'
import { createModelActions } from './settings/actionsModels.ts'
import { createScopeActions } from './settings/actionsScopes.ts'

export * from './settings/constants.ts'
export type { SettingsKey } from './settings/reset.ts'

export type SettingsState = typeof SETTINGS_DEFAULTS & {
  loaded: boolean
  load: () => Promise<void>
  resetSetting: (key: SettingsKey, field?: string) => void
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
  setModelInfoLayout: (value: 'horizontal' | 'vertical') => void
  setCivitaiMarks: (value: CivitaiMarks) => void
  rememberCivitaiMarks: (names: string[]) => void
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
  setHiresPath: (value: string) => void
  setImageName: (value: string) => void
  setGridName: (value: string) => void
  setHiresName: (value: string) => void
  setImageFormat: (value: ImageFormat) => void
  setGridFormat: (value: ImageFormat) => void
  setImageQuality: (value: number) => void
  setSaveLargeAsJpeg: (value: boolean) => void
  setLargeJpegMaxKb: (value: number) => void
  setThumbMegapixels: (value: number) => void
  setThumbFormat: (value: ImageFormat) => void
  setThumbQuality: (value: number) => void
  setSaveRawThumbs: (value: boolean) => void
  setSaveAnimatedThumbs: (value: boolean) => void
  setAnimatedThumbFormat: (value: AnimatedThumbFormat) => void
  setDownloadThumbMegapixels: (value: number) => void
  setDownloadThumbImageFormat: (value: ImageFormat) => void
  setDownloadThumbVideoFormat: (value: AnimatedThumbFormat) => void
  setDownloadThumbQuality: (value: number) => void
  setGalleryItemThumbMegapixels: (value: number) => void
  setGalleryItemThumbFormat: (value: ImageFormat) => void
  setGalleryItemThumbVideoFormat: (value: AnimatedThumbFormat) => void
  setGalleryItemThumbQuality: (value: number) => void
  setGalleryPageSize: (value: number) => void
  setDownloadHistoryLimit: (value: number) => void
  setBrowseHistoryLimit: (value: number) => void
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
  setDownloadQueue: (value: boolean) => void
  setDownloadQueueParallel: (value: number) => void
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
  setModelsTab: (value: 'Local' | 'CivitAI' | 'Manager') => void
  setModelsKind: (value: 'all' | 'checkpoints' | 'loras' | 'wildcards' | 'other') => void
  setCivitaiBrowse: (value: Partial<CivitaiBrowse>) => void
  setCivitaiTabs: (value: CivitaiTab[]) => void
  setCivitaiTabId: (value: number | null) => void
  setGalleryTypes: (key: string, value: string[]) => void
  setGalleryQuery: (key: string, value: string) => void
  setGalleryLocalScope: (key: string, patch: Partial<GalleryLocalScope>) => void
  dropGalleryLocalScopeId: (id: string) => void
  setGalleryScopeMode: (key: GalleryModeKey, value: GalleryFilterScope) => void
  setGalleryFilterMode: (key: GalleryModeKey, value: GalleryFilterScope) => void
  setGalleryAutoTypes: (key: string, value: boolean) => void
  setGalleryPinSelected: (key: string, value: boolean) => void
  setGalleryBrowseSort: (kind: GalleryBrowseKind, value: GalleryBrowseSort) => void
  setGalleryBrowseDir: (kind: GalleryBrowseKind, value: GallerySortDir) => void
  setGalleryBrowseShare: (value: boolean) => void
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
  'modelInfoLayout',
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
  'hiresPath',
  'imageName',
  'gridName',
  'hiresName',
  'imageFormat',
  'gridFormat',
  'imageQuality',
  'saveLargeAsJpeg',
  'largeJpegMaxKb',
  'thumbMegapixels',
  'thumbFormat',
  'thumbQuality',
  'saveRawThumbs',
  'saveAnimatedThumbs',
  'animatedThumbFormat',
  'downloadThumbMegapixels',
  'downloadThumbImageFormat',
  'downloadThumbVideoFormat',
  'downloadThumbQuality',
  'galleryItemThumbMegapixels',
  'galleryItemThumbFormat',
  'galleryItemThumbVideoFormat',
  'galleryItemThumbQuality',
  'galleryPageSize',
  'downloadHistoryLimit',
  'browseHistoryLimit',
  'civitaiMarks',
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
  'downloadQueue',
  'downloadQueueParallel',
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
  'galleryAutoTypes',
  'galleryPinSelected',
  'galleryBrowseSort',
  'galleryBrowseDir',
  'galleryBrowseShare',
] as const

type SettingsValues = typeof SETTINGS_DEFAULTS
type SettingsActions = Omit<SettingsState, keyof SettingsValues | 'loaded' | 'load' | 'resetSetting'>

function diff(state: SettingsValues): UserSettings {
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
  resetSetting: (key, field) => {
    set((state) => applySettingReset(state, key, field))
    persist()
  },
  ...(createGenerateActions(set as never, persist) as SettingsActions),
  ...(createModelActions(set as never, persist) as SettingsActions),
  ...(createScopeActions(set as never, persist) as SettingsActions),
}))
