import type { ModelEntry } from '@/lib/api.ts'

export function displayName(item: ModelEntry | null, fallback: string) {
  if (!item) {
    return fileName(fallback)
  }
  return item.label || item.tag || fileName(item.path) || fileName(fallback)
}

function fileName(path: string) {
  const base = path.replace(/\\/g, '/').split('/').pop() || path
  return base.replace(/\.[^/.]+$/, '')
}
