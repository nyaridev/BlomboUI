import {
  applyCivitaiMeta,
  civitaiHashes,
  hasCivitaiLocalData,
  lookupCivitai,
  waitModelInfo,
} from '@/lib/civitai/fill.ts'
import { deleteModelThumb, saveModelInfo, type ModelEntry, type ModelLists } from '@/lib/api.ts'
import { civitaiSaveThumbView } from '@/lib/gallery/thumbView.ts'
import { useModelsStore } from '@/stores/modelsStore.ts'

export type ScrapeKind = 'checkpoints' | 'loras'
export type ClearKind = keyof Pick<ModelLists, 'checkpoints' | 'loras' | 'wildcards'>
export type ScrapeMode = 'missing' | 'force' | 'full'
export type ClearMode = 'thumbs' | 'meta'
export type ScrapeCounts = { filled: number; skipped: number; missed: number; cancelled: boolean }

let busy = false

export function civitaiJobBusy() {
  return busy
}

function filePath(item: ModelEntry) {
  if (item.dir) {
    return ''
  }
  return item.source || item.path.split('#')[0] || item.path
}

function paths(kind: ClearKind, perTile = false) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of useModelsStore.getState()[kind]) {
    const path = perTile ? item.path : filePath(item)
    if (!path || seen.has(path)) {
      continue
    }
    seen.add(path)
    out.push(path)
  }
  return out
}

export async function scrapeCivitai(
  kind: ScrapeKind,
  mode: ScrapeMode,
  signal: AbortSignal,
  onProgress?: (done: number, total: number) => void,
): Promise<ScrapeCounts> {
  if (busy) {
    return { filled: 0, skipped: 0, missed: 0, cancelled: true }
  }
  busy = true
  const list = paths(kind)
  const total = list.length
  const lora = kind === 'loras'
  let filled = 0
  let skipped = 0
  let missed = 0
  try {
    for (let i = 0; i < list.length; i++) {
      if (signal.aborted) {
        return { filled, skipped, missed, cancelled: true }
      }
      onProgress?.(i, total)
      const path = list[i]
      try {
        const dest = civitaiSaveThumbView()
        const info = await waitModelInfo(kind, path, signal, dest)
        if (signal.aborted) {
          return { filled, skipped, missed, cancelled: true }
        }
        if (!civitaiHashes(info).length) {
          skipped += 1
          continue
        }
        if (mode === 'missing' && hasCivitaiLocalData(info, lora)) {
          skipped += 1
          continue
        }
        if (mode === 'force' && info.thumb_exact) {
          skipped += 1
          continue
        }
        const hit = await lookupCivitai(civitaiHashes(info))
        if (signal.aborted) {
          return { filled, skipped, missed, cancelled: true }
        }
        if (!hit) {
          missed += 1
          continue
        }
        const next = await applyCivitaiMeta(kind, path, hit, { types: info.types || [], prompt: info.prompt || '' })
        if (next.thumb) {
          useModelsStore.getState().setThumb(kind, path, next.thumb)
        }
        if (lora) {
          useModelsStore.getState().setMeta(kind, path, { prompt: next.prompt })
        }
        filled += 1
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return { filled, skipped, missed, cancelled: true }
        }
        missed += 1
      }
    }
    onProgress?.(total, total)
    return { filled, skipped, missed, cancelled: false }
  } finally {
    busy = false
  }
}

export async function clearCivitai(
  kind: ClearKind,
  mode: ClearMode,
  signal: AbortSignal,
  onProgress?: (done: number, total: number) => void,
): Promise<ScrapeCounts> {
  if (busy) {
    return { filled: 0, skipped: 0, missed: 0, cancelled: true }
  }
  busy = true
  const list = paths(kind, mode === 'thumbs')
  const total = list.length
  const lora = kind === 'loras'
  let filled = 0
  let missed = 0
  try {
    for (let i = 0; i < list.length; i++) {
      if (signal.aborted) {
        return { filled, skipped: 0, missed, cancelled: true }
      }
      onProgress?.(i, total)
      const path = list[i]
      try {
        if (mode === 'thumbs') {
          await deleteModelThumb(kind, path, undefined, true)
          useModelsStore.getState().setThumb(kind, path, 0)
        } else {
          await saveModelInfo(kind, path, [], lora ? { prompt: '' } : undefined)
          if (lora) {
            useModelsStore.getState().setMeta(kind, path, { prompt: '' })
          }
        }
        filled += 1
      } catch {
        missed += 1
      }
    }
    onProgress?.(total, total)
    return { filled, skipped: 0, missed, cancelled: false }
  } finally {
    busy = false
  }
}
