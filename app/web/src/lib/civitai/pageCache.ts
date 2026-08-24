import { getCivitaiModel, type CivitaiModelDetail } from '@/lib/api.ts'
import { pickVersionId } from '@/lib/civitai/version.ts'

export type CivitaiPageCache = {
  model: CivitaiModelDetail | null
  versionId: number | null
  error: string
}

const pages = new Map<number, CivitaiPageCache>()
const inflight = new Map<number, Promise<CivitaiModelDetail>>()
const bitmaps = new Map<string, HTMLImageElement>()
const generations = new Map<number, number>()

function imageUrls(model: CivitaiModelDetail) {
  const urls: string[] = []
  for (const version of model.versions) {
    for (const image of version.images) {
      if (image.url && !urls.includes(image.url)) {
        urls.push(image.url)
      }
    }
  }
  return urls
}

export function prefetchCivitaiImages(urls: string[]) {
  for (const url of urls) {
    if (!url || bitmaps.has(url)) {
      continue
    }
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    bitmaps.set(url, img)
  }
}

function retainImages() {
  const keep = new Set<string>()
  for (const page of pages.values()) {
    if (!page.model) {
      continue
    }
    for (const url of imageUrls(page.model)) {
      keep.add(url)
    }
  }
  for (const url of bitmaps.keys()) {
    if (!keep.has(url)) {
      bitmaps.delete(url)
    }
  }
}

export function peekCivitaiPage(id: number) {
  return pages.get(id)
}

export function setCachedVersion(id: number, versionId: number | null) {
  const page = pages.get(id)
  if (page) {
    page.versionId = versionId
  }
}

export function dropCivitaiPage(id: number) {
  generations.set(id, (generations.get(id) || 0) + 1)
  pages.delete(id)
  inflight.delete(id)
  retainImages()
}

export async function loadCivitaiPage(id: number, preferredBases: string[]): Promise<CivitaiPageCache> {
  const hit = pages.get(id)
  if (hit?.model && !hit.error) {
    prefetchCivitaiImages(imageUrls(hit.model))
    return hit
  }
  let pending = inflight.get(id)
  if (!pending) {
    pending = getCivitaiModel(id)
    inflight.set(id, pending)
  }
  const generation = generations.get(id) || 0
  try {
    const model = await pending
    if (generation !== (generations.get(id) || 0)) {
      return {
        model,
        versionId: null,
        error: 'Model page was closed',
      }
    }
    const page: CivitaiPageCache = {
      model,
      versionId: pickVersionId(model.versions, preferredBases) ?? null,
      error: '',
    }
    pages.set(id, page)
    prefetchCivitaiImages(imageUrls(model))
    return page
  } catch (err) {
    if (generation !== (generations.get(id) || 0)) {
      return {
        model: null,
        versionId: null,
        error: 'Model page was closed',
      }
    }
    const page: CivitaiPageCache = {
      model: null,
      versionId: null,
      error: err instanceof Error ? err.message : 'Could not load model',
    }
    pages.set(id, page)
    return page
  } finally {
    if (inflight.get(id) === pending) {
      inflight.delete(id)
    }
  }
}
