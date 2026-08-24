import type { Job } from '@/lib/api.ts'
import { loraNameMatches, parseLoraHits } from '@/lib/prompt/loraTags.ts'
import { parseWildcardTags, wildcardMatches } from '@/lib/prompt/wildcardTags.ts'
import { autoLoraId, type ModelSwap } from '@/stores/generateStore.ts'

export function idsFromJob(job: Job): string[] {
  return job.gallery_ids
}

export function selectedLoraPaths(
  prompt: string,
  items: { path: string; auto_apply?: boolean | null }[],
  activeOrder: string[],
  autoDefault: boolean,
) {
  const out: string[] = []
  const seen = new Set<string>()
  for (const hit of parseLoraHits(prompt)) {
    const item = items.find((row) => loraNameMatches(hit.name, row.path))
    if (item && !seen.has(item.path)) {
      seen.add(item.path)
      out.push(item.path)
    }
  }
  for (const id of activeOrder) {
    if (!id.startsWith(autoLoraId(''))) {
      continue
    }
    const path = id.slice(autoLoraId('').length)
    const item = items.find((row) => row.path === path)
    if (path && (!item || Boolean(item.auto_apply ?? autoDefault)) && !seen.has(path)) {
      seen.add(path)
      out.push(path)
    }
  }
  return out
}

export function selectedWildcardPaths(prompt: string, items: { path: string }[]) {
  const out: string[] = []
  const seen = new Set<string>()
  for (const hit of parseWildcardTags(prompt)) {
    const item = items.find((row) => wildcardMatches(row, hit.name))
    if (item && !seen.has(item.path)) {
      seen.add(item.path)
      out.push(item.path)
    }
  }
  return out
}

export function promptMatrixLines(raw: unknown): string[] {
  const values = typeof raw === 'string' ? raw.split(/\r?\n/) : Array.isArray(raw) ? raw : []
  return values
    .map((value) => String(value).trim().replace(/,+$/, '').trim())
    .filter(Boolean)
}

export function etaSeconds(startedAt: string | null, value: number, max: number): number | null {
  if (!startedAt || value <= 0 || max <= 0) {
    return null
  }
  const elapsed = (Date.now() - Date.parse(startedAt)) / 1000
  if (!Number.isFinite(elapsed) || elapsed < 0.5) {
    return null
  }
  return Math.max(0, Math.round((elapsed * (max - value)) / value))
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds * 10) / 10}s`
  }
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${String(s).padStart(2, '0')}s`
}

export function jobSeconds(job: Job): number | null {
  if (job.status !== 'completed') {
    return null
  }
  const ms = Number(job.payload.duration_ms)
  if (Number.isFinite(ms) && ms >= 0) {
    return ms / 1000
  }
  if (job.started_at && job.finished_at) {
    const elapsed = (Date.parse(job.finished_at) - Date.parse(job.started_at)) / 1000
    if (Number.isFinite(elapsed) && elapsed >= 0) {
      return elapsed
    }
  }
  return null
}

export const PARAMS_RATIO = 0.5
export const PARAMS_MIN_REM = 18
export const PARAMS_MAX_RATIO = 0.75

export function remPx() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

export function defaultParamsWidth(row: HTMLElement | null) {
  return row && row.clientWidth > 0 ? row.clientWidth * PARAMS_RATIO : PARAMS_MIN_REM * remPx()
}

export function progressLabel(pct: number, eta: number | null): string {
  if (pct <= 0) {
    return 'Starting…'
  }
  if (eta == null) {
    return `${Math.round(pct)}%`
  }
  return `${Math.round(pct)}% ETA: ${eta}s`
}

export function tabForSwap(swap: ModelSwap | null) {
  if (!swap) {
    return null
  }
  if (swap.slot === 'lora') {
    return 'LoRa'
  }
  if (swap.slot === 'wildcard') {
    return 'Wildcards'
  }
  if (swap.slot === 'vae' || swap.slot === 'textEncoder') {
    return 'Other'
  }
  return 'Base Model'
}
