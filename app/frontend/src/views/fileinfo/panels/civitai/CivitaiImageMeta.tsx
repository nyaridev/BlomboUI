import type { CivitaiImageMeta } from '@/lib/api.ts'
import { GenMetaPanel } from '@/views/fileinfo/panels/image/ImageInfo.tsx'

function pick(meta: CivitaiImageMeta, ...keys: string[]) {
  for (const key of keys) {
    const value = meta[key]
    if (value != null && value !== '') {
      return String(value)
    }
  }
  return ''
}

export function CivitaiImageMetaPanel({ meta }: { meta: CivitaiImageMeta }) {
  const prompt = pick(meta, 'prompt', 'Prompt')
  const negative = pick(meta, 'negativePrompt', 'Negative prompt')
  const rows = [
    ['Steps', pick(meta, 'steps', 'Steps')],
    ['CFG', pick(meta, 'cfgScale', 'cfg', 'CFG scale')],
    ['Sampler', pick(meta, 'sampler', 'Sampler')],
    ['Scheduler', pick(meta, 'scheduler', 'Schedule type', 'Schedule')],
    ['Seed', pick(meta, 'seed', 'Seed')],
    ['Size', pick(meta, 'Size', 'size')],
    ['Model', pick(meta, 'Model', 'model')],
    ['Clip skip', pick(meta, 'clipSkip', 'Clip skip')],
  ]
    .filter((row) => row[1])
    .map(([label, value]) => ({ label, value }))

  if (!prompt && !negative && !rows.length) {
    return <p className="text-sm text-muted">No generation metadata on this image.</p>
  }

  return <GenMetaPanel prompt={prompt} negative={negative} rows={rows} />
}
