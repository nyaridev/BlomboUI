import { useSettingsStore, LOCAL_SCOPE_DEFAULT, type GalleryLocalScope, type GalleryViewKind } from '@/stores/settingsStore.ts'
import { modelThumbUrl, type ModelEntry, type ModelLists, type ThumbView } from '@/lib/api.ts'

export const GLOBAL_SCOPE = 'global'
export const RAW_TILE_MIN_PX = 512

let autoIds: string[] = []

export function setAutoScopeIds(ids: string[]) {
  autoIds = ids.filter((id) => id && id !== GLOBAL_SCOPE)
}

export function autoScopeIds() {
  return autoIds
}

export function readScopePack(scopeKey = GLOBAL_SCOPE): GalleryLocalScope {
  const settings = useSettingsStore.getState()
  if (!scopeKey || scopeKey === GLOBAL_SCOPE) {
    return {
      ids: settings.thumbScopeIds,
      optionalIds: settings.thumbScopeOptionalIds,
      auto: settings.thumbScopeAuto,
      mode: settings.thumbDisplayMode,
      fallback: settings.galleryThumbFallback,
    }
  }
  return settings.galleryLocalScopes[scopeKey] ?? LOCAL_SCOPE_DEFAULT
}

export function selectedScopeIds(scopeKey = GLOBAL_SCOPE) {
  const pack = readScopePack(scopeKey)
  const ids = pack.auto ? autoIds : pack.ids
  return ids.filter((id) => id && id !== GLOBAL_SCOPE)
}

export function optionalScopeIds(ids?: string[], scopeKey = GLOBAL_SCOPE) {
  const optional = new Set(readScopePack(scopeKey).optionalIds)
  return (ids ?? selectedScopeIds(scopeKey)).filter((id) => optional.has(id))
}

export function contextKey(ids: string[] = selectedScopeIds()) {
  const unique = [...new Set(ids.filter((id) => id && id !== GLOBAL_SCOPE))].sort()
  return unique.length ? unique.join('+') : GLOBAL_SCOPE
}

export function saveContext() {
  return contextKey()
}

export function civitaiSaveContext() {
  const settings = useSettingsStore.getState()
  if (settings.thumbSaveTo === 'global') {
    return GLOBAL_SCOPE
  }
  return contextKey()
}

export function thumbView(fallback = false, scopeKey = GLOBAL_SCOPE): ThumbView {
  const pack = readScopePack(scopeKey)
  const ids = selectedScopeIds(scopeKey)
  const optional = optionalScopeIds(ids, scopeKey)
  return {
    context: contextKey(ids),
    mode: pack.mode,
    fallback,
    optional: optional.length ? optional.join('+') : undefined,
  }
}

export function galleryThumbView(kind: GalleryViewKind | string, scopeKey = GLOBAL_SCOPE): ThumbView {
  if (kind === 'trash') {
    return thumbView(useSettingsStore.getState().trashThumbFallback, GLOBAL_SCOPE)
  }
  return thumbView(readScopePack(scopeKey).fallback, scopeKey)
}

export function trashThumbView(): ThumbView {
  return thumbView(useSettingsStore.getState().trashThumbFallback)
}

export function saveThumbView(): ThumbView {
  return { context: saveContext() }
}

export function civitaiSaveThumbView(): ThumbView {
  return { context: civitaiSaveContext() }
}

export function modelThumbSrc(
  kind: keyof ModelLists,
  item: Pick<ModelEntry, 'path' | 'thumb' | 'thumb_media' | 'thumb_global' | 'thumb_global_media'> | null,
  view?: ThumbView,
) {
  if (!item?.path) {
    return null
  }
  const next = view || galleryThumbView(kind)
  const tick = item.thumb || (next.fallback ? item.thumb_global : 0) || 0
  if (!tick) {
    return null
  }
  const media = item.thumb ? item.thumb_media : next.fallback ? item.thumb_global_media : ''
  return modelThumbUrl(kind, item.path, tick, next, media)
}
