import {
  applyCivitaiMeta,
  civitaiHashes,
  hasCivitaiLocalData,
  lookupCivitai,
  waitModelInfo,
  type CivitaiFillScope,
} from '@/lib/civitai/fill.ts'
import { deleteModelThumb, saveModelInfo, type ModelEntry, type ModelLists } from '@/lib/api.ts'
import { civitaiSaveThumbView } from '@/lib/gallery/thumbView.ts'
import { useModelsStore } from '@/stores/modelsStore.ts'

export type ScrapeKind = 'checkpoints' | 'loras'
export type ClearKind = keyof Pick<ModelLists, 'checkpoints' | 'loras' | 'wildcards'>
export type ScrapeMode = 'missing' | 'force' | 'full'
export type ScrapeScope = CivitaiFillScope
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
  const out: { kind: keyof ModelLists; path: string }[] = []
  const kinds: (keyof ModelLists)[] = kind === 'checkpoints' ? ['checkpoints', 'diffusion_models'] : [kind]
  const store = useModelsStore.getState()
  for (const itemKind of kinds) {
    for (const item of store[itemKind]) {
      const path = perTile ? item.path : filePath(item)
      if (!path || seen.has(path)) {
        continue
      }
      seen.add(path)
      out.push({ kind: itemKind, path })
    }
  }
  return out
}

export async function scrapeCivitai(
  kind: ScrapeKind,
  mode: ScrapeMode,
  signal: AbortSignal,
  onProgress?: (done: number, total: number) => void,
  scope: ScrapeScope = 'all',
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
      const { kind: itemKind, path } = list[i]
      try {
        const dest = civitaiSaveThumbView()
        const info = await waitModelInfo(itemKind, path, signal, dest)
        if (signal.aborted) {
          return { filled, skipped, missed, cancelled: true }
        }
        if (!civitaiHashes(info).length) {
          skipped += 1
          continue
        }
        if (mode === 'missing' && hasCivitaiLocalData(info, lora, scope)) {
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
        const next = await applyCivitaiMeta(itemKind, path, hit, { types: info.types || [], prompt: info.prompt || '' }, scope)
        if (next.thumb) {
          useModelsStore.getState().setThumb(itemKind, path, next.thumb)
        }
        if (lora && scope !== 'thumbs') {
          useModelsStore.getState().setMeta(itemKind, path, { prompt: next.prompt })
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
      const { kind: itemKind, path } = list[i]
      try {
        if (mode === 'thumbs') {
          await deleteModelThumb(itemKind, path, undefined, true)
          useModelsStore.getState().setThumb(itemKind, path, 0)
        } else {
          await saveModelInfo(itemKind, path, [], lora ? { prompt: '' } : undefined)
          if (lora) {
            useModelsStore.getState().setMeta(itemKind, path, { prompt: '' })
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
