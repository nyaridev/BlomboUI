import {
  fetchCivitaiImage,
  getCivitaiByHash,
  getModelInfo,
  saveModelInfo,
  saveModelThumb,
  type CivitaiVersion,
  type ModelInfo,
  type ModelLists,
  type ThumbMeta,
  type ThumbView,
} from '@/lib/api.ts'
import { matchModelType } from '@/lib/modelTypes.ts'
import { civitaiSaveThumbView } from '@/lib/gallery/thumbView.ts'

export function civitaiPreviewUrl(info: CivitaiVersion) {
  const creator = info.model?.creator?.username
  const list = (info.images || []).filter((image) => image.url && image.type !== 'video')
  if (creator && list.some((image) => image.username)) {
    const matched = list.filter((image) => image.username === creator)
    if (matched[0]?.url) {
      return matched[0].url
    }
  }
  return list[0]?.url || ''
}

export function civitaiHashes(info: { hashes?: { sha256?: string; autov1?: string; autov2?: string; autov3?: string }; hash?: string }) {
  const hashes = info.hashes
  return [...new Set([hashes?.autov3, hashes?.autov2 || info.hash, hashes?.autov1, hashes?.sha256].filter(Boolean))] as string[]
}

export function civitaiThumbMeta(hit: CivitaiVersion): ThumbMeta {
  const url = civitaiPreviewUrl(hit)
  const image = (hit.images || []).find((item) => item.url === url)
  return {
    prompt: String(image?.meta?.prompt || ''),
    origin: 'civitai',
    civitai: {
      id: hit.id,
      modelId: hit.modelId,
      name: hit.name,
      baseModel: hit.baseModel,
      image: url,
    },
  }
}

export function hasCivitaiLocalData(info: Pick<ModelInfo, 'types' | 'thumb' | 'thumb_exact' | 'prompt'>, lora: boolean) {
  return Boolean((info.types || []).length || info.thumb_exact || (lora && (info.prompt || '').trim()))
}

export async function lookupCivitai(hashes: string[]) {
  const seen = new Set<string>()
  for (const hash of hashes) {
    const value = hash.trim().toLowerCase()
    if (!value || seen.has(value)) {
      continue
    }
    seen.add(value)
    const hit = await getCivitaiByHash(value)
    if (hit) {
      return hit
    }
  }
  return null
}

export async function waitModelInfo(kind: keyof ModelLists, path: string, signal?: AbortSignal, view?: ThumbView) {
  for (;;) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    const info = await getModelInfo(kind, path, view)
    const hashes = civitaiHashes(info)
    if (hashes.length && (!info.hashing || info.hashes?.autov2 || info.hash)) {
      return info
    }
    if (!info.hashing) {
      return info
    }
    await new Promise((resolve) => window.setTimeout(resolve, 400))
  }
}

export async function applyCivitaiMeta(kind: keyof ModelLists, path: string, hit: CivitaiVersion, current: Pick<ModelInfo, 'types' | 'prompt'>) {
  const lora = kind === 'loras'
  const type = matchModelType(hit.baseModel || '')
  const types = type ? [type] : current.types || []
  const words = (hit.trainedWords || []).map((word) => word.trim()).filter(Boolean)
  const prompt = lora && words.length ? words.join(', ') : current.prompt || ''
  await saveModelInfo(kind, path, types, lora ? { prompt } : undefined)
  const url = civitaiPreviewUrl(hit)
  let thumb = 0
  if (url) {
    const file = await fetchCivitaiImage(url)
    thumb = await saveModelThumb(kind, path, file, civitaiSaveThumbView(), civitaiThumbMeta(hit))
  }
  return { thumb, types, prompt }
}
