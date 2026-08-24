import { api, readError } from './http.ts'

export type FolderDir = {
  id: string
  name: string
  path: string
}

export type UserSettings = {
  batchGrid?: boolean
  batchGridMax?: number
  batchGridQuality?: number
  batchGridRows?: number
  batchGridFill?: boolean
  batchGridOnCancel?: boolean
  saveInterrupted?: boolean
  genPreview?: boolean
  genPreviewEvery?: number
  genPreviewAfter?: number
  genPreviewAfterFirst?: boolean
  genPreviewLast?: boolean
  interruptedInGrid?: boolean
  galleryHideInterrupted?: boolean
  hiddenGenerateTabs?: string[]
  hiddenMainTabs?: string[]
  mainTabOrder?: string[]
  generateTabOrder?: string[]
  mainTabKeysFollowLayout?: boolean
  generateTabKeysFollowLayout?: boolean
  hiddenModelTypes?: string[]
  hiddenSamplers?: string[]
  hiddenSchedulers?: string[]
  theme?: string
  civitaiSite?: string
  civitaiApiKey?: string
  civitaiAutoRetry?: boolean
  civitaiAutoRetryCount?: number
  timeDisplay?: string
  setResolutions?: string[]
  imagePath?: string
  gridPath?: string
  interruptedPath?: string
  imageName?: string
  gridName?: string
  imageFormat?: string
  gridFormat?: string
  imageQuality?: number
  saveLargeAsJpeg?: boolean
  largeJpegMaxKb?: number
  gallerySortKey?: Record<string, string> | string
  gallerySortDir?: Record<string, string> | string
  galleryTileScale?: number
  galleryThumbFallback?: boolean | Record<string, boolean>
  thumbSaveTo?: 'active' | 'global'
  thumbDisplayMode?: 'likely' | 'exact'
  thumbScopeIds?: string[]
  thumbScopeOptionalIds?: string[]
  thumbScopeAuto?: boolean
  trashThumbFallback?: boolean
  galleryParentOnUnselect?: boolean
  promptWeightStep?: number
  loraStrengthMin?: number
  loraStrengthMax?: number
  loraSliderMin?: number
  loraSliderMax?: number
  loraAutoApply?: boolean
  loraApplyAt?: 'start' | 'end'
  modelDirs?: FolderDir[]
  wildcardDirs?: FolderDir[]
  galleryDirs?: FolderDir[]
  civitaiDownload?: {
    modelDirId?: string
    wildcardDirId?: string
    modelIntelligent?: boolean
    modelSortBaseModel?: boolean
    modelSortCategory?: boolean
    modelSortCreator?: boolean
    modelNaming?: string
    wildcardIntelligent?: boolean
    wildcardUnpack?: boolean
    updateModelInfo?: boolean
    authorAliases?: Record<string, string>
  }
  removedAfterHours?: number
  removedMaxGb?: number
  autocompleteEnabled?: boolean
  autocompleteMode?: string
  autocompleteTypes?: string[]
  wildcardCompleteEnabled?: boolean
  loraCompleteEnabled?: boolean
  loraTriggerCompleteEnabled?: boolean
  wildcardCompleteThumbs?: boolean
  loraCompleteThumbs?: boolean
  autocompleteThumbScale?: number
  frequentTagsEnabled?: boolean
  autocompleteLists?: Record<string, { enabled?: boolean; mode?: string; types?: string[] }>
  galleryPinSelected?: Record<string, boolean>
  scopeGroups?: string[]
  scopeOrder?: string[]
  lookupScopeIds?: string[]
  lookupScopeOptionalIds?: string[]
  lookupKinds?: string[]
  lookupModels?: string[]
  scopeSearch?: string
  modelsTab?: string
  modelsKind?: string
  civitaiBrowse?: {
    query?: string
    sort?: string
    period?: string
    types?: string[]
    baseModels?: string[]
    tag?: string
    nsfw?: boolean
    earlyAccess?: string
    supportsGeneration?: string
    fromPlatform?: string
  }
  civitaiTabs?: {
    id?: number
    name?: string
    initialVersionId?: number
    versionId?: number
  }[]
  civitaiTabId?: number | null
  galleryTypes?: Record<string, string[]>
  galleryQuery?: Record<string, string>
  galleryLocalScopes?: Record<
    string,
    { ids?: string[]; optionalIds?: string[]; auto?: boolean; mode?: string; fallback?: boolean }
  >
  galleryScopeMode?: Record<string, string>
  galleryFilterMode?: Record<string, string>
  galleryFilterShareModels?: boolean
}

export type AppPaths = {
  models: string
  wildcards: string
  output: string
  userName: string
}

export async function pickFolder(): Promise<string | null> {
  const res = await fetch(api('/pick-folder'), { method: 'POST' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { path?: string | null }
  return data.path || null
}

export async function getAppPaths(): Promise<AppPaths> {
  const res = await fetch(api('/paths'))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as AppPaths
}

export async function checkFolderPaths(paths: string[]): Promise<Record<string, boolean>> {
  const res = await fetch(api('/paths/check'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { exists?: Record<string, boolean> }
  return data.exists && typeof data.exists === 'object' ? data.exists : {}
}

export async function openFolder(path: string): Promise<void> {
  const res = await fetch(api('/paths/open'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
}

export async function setOutputPath(path: string): Promise<AppPaths> {
  const res = await fetch(api('/paths/output'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as AppPaths
}

export async function syncModelPaths(): Promise<void> {
  const res = await fetch(api('/paths/models/sync'), { method: 'POST' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
}

export async function reloadComfy(): Promise<void> {
  const res = await fetch(api('/paths/models/reload'), { method: 'POST' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
}

export async function getSettings(): Promise<UserSettings> {
  const res = await fetch(api('/user-settings'))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { settings?: UserSettings }
  return data.settings && typeof data.settings === 'object' ? data.settings : {}
}

export async function saveSettings(settings: UserSettings): Promise<UserSettings> {
  const res = await fetch(api('/user-settings'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { settings?: UserSettings }
  return data.settings && typeof data.settings === 'object' ? data.settings : settings
}

export async function reloadApp(): Promise<void> {
  try {
    await fetch(api('/reload'), { method: 'POST' })
  } catch {
    return
  }
}
