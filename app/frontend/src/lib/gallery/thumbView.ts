import { useSettingsStore, LOCAL_SCOPE_DEFAULT, type GalleryLocalScope, type GalleryViewKind } from '@/stores/settingsStore.ts'
import { galleryScopeKey } from '@/stores/settings/constants.ts'
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

export function generateGalleryViewKey(kind?: string) {
  if (kind === 'loras') {
    return 'loras'
  }
  if (kind === 'wildcards') {
    return 'wildcards'
  }
  if (kind === 'vae' || kind === 'text_encoders' || kind === 'upscale_models' || kind === 'controlnet' || kind === 'embeddings' || kind === 'sams' || kind === 'ultralytics') {
    return 'other'
  }
  return 'checkpoints'
}

export function generateGalleryScopeKey(kind?: string) {
  return galleryScopeKey(generateGalleryViewKey(kind), useSettingsStore.getState())
}

export function saveContext(scopeKey = GLOBAL_SCOPE) {
  return contextKey(selectedScopeIds(scopeKey))
}

export function civitaiSaveContext(kind?: string) {
  const settings = useSettingsStore.getState()
  if (settings.thumbSaveTo === 'global') {
    return GLOBAL_SCOPE
  }
  return saveContext(generateGalleryScopeKey(kind))
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

export function galleryThumbView(kind: GalleryViewKind | string, scopeKey?: string): ThumbView {
  if (kind === 'trash') {
    return thumbView(useSettingsStore.getState().trashThumbFallback, GLOBAL_SCOPE)
  }
  const key = scopeKey ?? generateGalleryScopeKey(kind)
  return thumbView(readScopePack(key).fallback, key)
}

export function trashThumbView(): ThumbView {
  return thumbView(useSettingsStore.getState().trashThumbFallback)
}

export function saveThumbView(scopeKey = GLOBAL_SCOPE): ThumbView {
  return { context: saveContext(scopeKey) }
}

export function civitaiSaveThumbView(kind?: string): ThumbView {
  return { context: civitaiSaveContext(kind) }
}

export function modelThumbSrc(
  kind: keyof ModelLists,
  item: Pick<
    ModelEntry,
    'path' | 'thumb' | 'thumb_media' | 'thumb_global' | 'thumb_global_media' | 'thumb_exact' | 'thumb_exact_media' | 'thumb_any'
  > | null,
  view?: ThumbView,
) {
  if (!item?.path) {
    return null
  }
  const next = view || galleryThumbView(kind)
  const tick = Math.max(item.thumb_any || 0, item.thumb || 0, item.thumb_exact || 0, item.thumb_global || 0)
  if (!tick) {
    return null
  }
  return modelThumbUrl(kind, item.path, tick, next)
}
