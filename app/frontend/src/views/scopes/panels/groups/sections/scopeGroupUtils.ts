import { modelThumbUrl, type ScopeThumb } from '@/lib/api.ts'
import { GLOBAL_SCOPE } from '@/lib/gallery/thumbView.ts'

export function memberThumb(scopeId: string, thumbs: ScopeThumb[], extra: string[], optional: string[]) {
  const need = [...new Set([scopeId, ...extra.filter((id) => id && id !== GLOBAL_SCOPE && id !== scopeId)])]
  const strict = extra.length === 0 && optional.length === 0
  let best: ScopeThumb | null = null
  let bestHits = -1
  let bestExtra = Infinity
  for (const row of thumbs) {
    const have = new Set(row.scopes)
    if (need.some((id) => !have.has(id))) {
      continue
    }
    if (strict && row.context !== scopeId && !(row.scopes.length === 1 && row.scopes[0] === scopeId)) {
      continue
    }
    const hits = optional.reduce((sum, id) => sum + (have.has(id) ? 1 : 0), 0)
    const leftover = have.size - need.length
    if (
      !best ||
      hits > bestHits ||
      (hits === bestHits && leftover < bestExtra) ||
      (hits === bestHits && leftover === bestExtra && row.mtime > best.mtime)
    ) {
      best = row
      bestHits = hits
      bestExtra = leftover
    }
  }
  return best
}

export function thumbSrc(thumb: ScopeThumb, raw = false) {
  return modelThumbUrl(
    thumb.kind,
    thumb.path,
    thumb.mtime || 1,
    { context: thumb.context, mode: 'exact', raw: raw || undefined },
    thumb.media,
  )
}
