import { useSettingsStore, type GalleryViewKind } from '@/stores/settingsStore.ts'
import { modelThumbUrl, type ModelEntry, type ModelLists, type ThumbView } from '@/lib/api.ts'

export const GLOBAL_SCOPE = 'global'

let autoIds: string[] = []

export function setAutoScopeIds(ids: string[]) {
  autoIds = ids.filter((id) => id && id !== GLOBAL_SCOPE)
}

export function autoScopeIds() {
  return autoIds
}

export function selectedScopeIds() {
  const settings = useSettingsStore.getState()
  const ids = settings.thumbScopeAuto ? autoIds : settings.thumbScopeIds
  return ids.filter((id) => id && id !== GLOBAL_SCOPE)
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

export function thumbView(fallback = false): ThumbView {
  const settings = useSettingsStore.getState()
  return {
    context: contextKey(),
    mode: settings.thumbDisplayMode,
    fallback,
  }
}

export function galleryThumbView(kind: GalleryViewKind | string): ThumbView {
  const settings = useSettingsStore.getState()
  const fallback =
    kind === 'checkpoints' || kind === 'loras' || kind === 'wildcards'
      ? Boolean(settings.galleryThumbFallback[kind])
      : Boolean(settings.trashThumbFallback)
  return thumbView(fallback)
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
  item: Pick<ModelEntry, 'path' | 'thumb' | 'thumb_global'> | null,
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
  return modelThumbUrl(kind, item.path, tick, next)
}
