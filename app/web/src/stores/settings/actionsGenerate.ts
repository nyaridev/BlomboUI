import type { SettingsState } from '../settingsStore.ts'
import type { SettingsSet } from './actionTypes.ts'
import {
  cleanCivitaiSite,
  cleanCompleteThumbScale,
  cleanAnimatedThumbFormat,
  cleanBrowseSort,
  cleanGenerateTabOrder,
  cleanHiddenMainTabs,
  cleanImageFormat,
  cleanImageQuality,
  cleanLoraBound,
  cleanThumbMegapixels,
  cleanNames,
  cleanPreviewCount,
  cleanPromptWeightStep,
  cleanSortDir,
  cleanSortKey,
  cleanTileScale,
  cleanTheme,
  cleanTimeDisplay,
  cleanMainTabOrder,
  cleanLargeJpegMaxKb,
  cleanHistoryLimit,
} from './clean.ts'
import {
  GALLERY_BROWSE_DIR_DEFAULT,
  GALLERY_BROWSE_SORT_DEFAULT,
  GALLERY_SORT_DIR_DEFAULT,
  GALLERY_SORT_KEY_DEFAULT,
  SETTINGS_DEFAULTS,
  galleryBrowseKey,
} from './constants.ts'
import { cleanSetResolutions } from '@/screens/generate/resolutions.ts'
import { cleanCivitaiMarks, missingMarkNames } from '@/lib/civitai/marks.ts'

export function createGenerateActions(set: SettingsSet, persist: () => void): Partial<SettingsState> {
  return {
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
    setCivitaiMarks: (civitaiMarks) => {
      set({ civitaiMarks: cleanCivitaiMarks(civitaiMarks) })
      persist()
    },
    rememberCivitaiMarks: (names) => {
      let added = false
      set((state) => {
        const extra = missingMarkNames(names, state.civitaiMarks)
        if (!Object.keys(extra).length) {
          return {}
        }
        added = true
        return { civitaiMarks: { ...state.civitaiMarks, ...extra } }
      })
      if (added) {
        persist()
      }
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
    setThumbMegapixels: (thumbMegapixels) => {
      set({ thumbMegapixels: cleanThumbMegapixels(thumbMegapixels) })
      persist()
    },
    setThumbFormat: (thumbFormat) => {
      set({ thumbFormat: cleanImageFormat(thumbFormat, SETTINGS_DEFAULTS.thumbFormat) })
      persist()
    },
    setThumbQuality: (thumbQuality) => {
      set({ thumbQuality: cleanImageQuality(thumbQuality, SETTINGS_DEFAULTS.thumbQuality) })
      persist()
    },
    setSaveRawThumbs: (saveRawThumbs) => {
      set({ saveRawThumbs })
      persist()
    },
    setSaveAnimatedThumbs: (saveAnimatedThumbs) => {
      set({ saveAnimatedThumbs })
      persist()
    },
    setAnimatedThumbFormat: (animatedThumbFormat) => {
      set({ animatedThumbFormat: cleanAnimatedThumbFormat(animatedThumbFormat) })
      persist()
    },
    setDownloadThumbMegapixels: (downloadThumbMegapixels) => {
      set({ downloadThumbMegapixels: cleanThumbMegapixels(downloadThumbMegapixels) })
      persist()
    },
    setDownloadThumbImageFormat: (downloadThumbImageFormat) => {
      set({
        downloadThumbImageFormat: cleanImageFormat(
          downloadThumbImageFormat,
          SETTINGS_DEFAULTS.downloadThumbImageFormat,
        ),
      })
      persist()
    },
    setDownloadThumbVideoFormat: (downloadThumbVideoFormat) => {
      set({ downloadThumbVideoFormat: cleanAnimatedThumbFormat(downloadThumbVideoFormat) })
      persist()
    },
    setDownloadThumbQuality: (downloadThumbQuality) => {
      set({
        downloadThumbQuality: cleanImageQuality(
          downloadThumbQuality,
          SETTINGS_DEFAULTS.downloadThumbQuality,
        ),
      })
      persist()
    },
    setDownloadHistoryLimit: (downloadHistoryLimit) => {
      set({ downloadHistoryLimit: cleanHistoryLimit(downloadHistoryLimit, SETTINGS_DEFAULTS.downloadHistoryLimit) })
      persist()
    },
    setBrowseHistoryLimit: (browseHistoryLimit) => {
      set({ browseHistoryLimit: cleanHistoryLimit(browseHistoryLimit, SETTINGS_DEFAULTS.browseHistoryLimit) })
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
        if (value === GALLERY_SORT_KEY_DEFAULT) {
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
        if (value === GALLERY_SORT_DIR_DEFAULT) {
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
    setAutocompleteThumbScale: (autocompleteThumbScale) => {
      set({ autocompleteThumbScale: cleanCompleteThumbScale(autocompleteThumbScale) })
      persist()
    },
    setGalleryBrowseSort: (kind, value) => {
      set((state) => {
        const key = galleryBrowseKey(kind, state.galleryBrowseShare)
        const next = { ...state.galleryBrowseSort }
        const sort = cleanBrowseSort(value)
        if (sort === GALLERY_BROWSE_SORT_DEFAULT) {
          delete next[key]
        } else {
          next[key] = sort
        }
        return { galleryBrowseSort: next }
      })
      persist()
    },
    setGalleryBrowseDir: (kind, value) => {
      set((state) => {
        const key = galleryBrowseKey(kind, state.galleryBrowseShare)
        const next = { ...state.galleryBrowseDir }
        if (value === GALLERY_BROWSE_DIR_DEFAULT) {
          delete next[key]
        } else {
          next[key] = value
        }
        return { galleryBrowseDir: next }
      })
      persist()
    },
    setGalleryBrowseShare: (galleryBrowseShare) => {
      set((state) => {
        if (!galleryBrowseShare) {
          return { galleryBrowseShare }
        }
        const sort =
          state.galleryBrowseSort.global ??
          state.galleryBrowseSort.checkpoints ??
          state.galleryBrowseSort.loras ??
          state.galleryBrowseSort.wildcards ??
          GALLERY_BROWSE_SORT_DEFAULT
        const dir =
          state.galleryBrowseDir.global ??
          state.galleryBrowseDir.checkpoints ??
          state.galleryBrowseDir.loras ??
          state.galleryBrowseDir.wildcards ??
          GALLERY_BROWSE_DIR_DEFAULT
        const galleryBrowseSort = { ...state.galleryBrowseSort }
        const galleryBrowseDir = { ...state.galleryBrowseDir }
        if (sort === GALLERY_BROWSE_SORT_DEFAULT) {
          delete galleryBrowseSort.global
        } else {
          galleryBrowseSort.global = sort
        }
        if (dir === GALLERY_BROWSE_DIR_DEFAULT) {
          delete galleryBrowseDir.global
        } else {
          galleryBrowseDir.global = dir
        }
        return { galleryBrowseShare, galleryBrowseSort, galleryBrowseDir }
      })
      persist()
    },
  }
}
