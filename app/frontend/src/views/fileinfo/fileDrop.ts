import { type MediaCarouselItem } from '@/components/composites/models/MediaCarousel.tsx'

export function isSafetensors(file: File) {
  return file.name.toLowerCase().endsWith('.safetensors')
}

export function isVideo(file: File) {
  return file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(file.name)
}

export function isMedia(file: File) {
  return file.type.startsWith('image/') || isVideo(file)
}

export function allowed(file: File) {
  return isMedia(file) || isSafetensors(file)
}

export function mediaItem(file: File): MediaCarouselItem {
  return { url: URL.createObjectURL(file), type: isVideo(file) ? 'video' : undefined }
}

export function revokeItems(items: MediaCarouselItem[]) {
  for (const item of items) {
    if (item.url.startsWith('blob:')) {
      URL.revokeObjectURL(item.url)
    }
  }
}

type HashModel = { kind?: string; hashes?: Record<string, string> }

export function pngModels(meta: Record<string, unknown> | null) {
  const params = meta?.params as
    | {
        prompt?: string
        prompt_raw?: string
        models?: HashModel[]
        hires?: { models?: HashModel[] }
        adetailer?: { units?: { models?: HashModel[] }[]; models?: HashModel[] }
      }
    | undefined
  const ok =
    meta?.version === 2 &&
    typeof params?.prompt === 'string' &&
    typeof params?.prompt_raw === 'string' &&
    Array.isArray(params.models)
  if (!ok || !params) {
    return { models: [] as HashModel[], extra: [] as HashModel[] }
  }
  const extra: HashModel[] = []
  if (Array.isArray(params.hires?.models)) {
    extra.push(...params.hires.models)
  }
  const units = params.adetailer?.units
  if (Array.isArray(units)) {
    for (const unit of units) {
      if (Array.isArray(unit?.models)) {
        extra.push(...unit.models)
      }
    }
  }
  if (Array.isArray(params.adetailer?.models)) {
    extra.push(...params.adetailer.models)
  }
  return { models: params.models || [], extra }
}
