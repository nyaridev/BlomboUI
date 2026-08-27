import { MetaCard } from '@/components/composites/models/MetaCard.tsx'
import type { JobGalleryItem, JobLora } from '@/lib/api.ts'

function stem(path: string) {
  const base = path.replace(/\\/g, '/').split('/').pop() || path
  return base.replace(/\.[^/.]+$/, '')
}

function num(value: number | string | null | undefined) {
  if (value == null || value === '') {
    return ''
  }
  return String(value)
}

function loraLine(item: JobLora) {
  const bits = [stem(item.path)]
  if (item.strength !== 1) {
    bits.push(String(item.strength))
  }
  if (item.hash) {
    bits.push(item.hash)
  }
  return bits.join(' · ')
}

function fields(info: JobGalleryItem) {
  const size = info.width && info.height ? `${info.width}x${info.height}` : ''
  return [
    ['Steps', num(info.steps)],
    ['Sampler', info.sampler],
    ['Scheduler', info.scheduler],
    ['CFG', num(info.cfg)],
    ['Seed', num(info.seed)],
    ['Size', size],
    ['Model', info.checkpoint],
    ['Model hash', info.checkpoint_hash],
  ].filter((row) => row[1]) as [string, string][]
}

export function GenerationInfo({ info }: { info: JobGalleryItem | null }) {
  if (!info) {
    return null
  }
  const rows = fields(info)
  const loras = info.loras || []
  if (!info.prompt && !info.negative_prompt && !rows.length && !loras.length) {
    return null
  }
  return (
    <div className="flex min-w-0 flex-col gap-2 text-xs">
      {info.prompt ? (
        <MetaCard title="Prompt" className="bg-field" mono>
          {info.prompt}
        </MetaCard>
      ) : null}
      {info.negative_prompt ? <MetaCard title="Negative">{info.negative_prompt}</MetaCard> : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {rows.map(([label, value]) => (
          <MetaCard key={label} title={label}>
            <span className="break-all">{value}</span>
          </MetaCard>
        ))}
      </div>
      {loras.length ? (
        <MetaCard title="LoRA" mono>
          {loras.map((item) => (
            <p key={item.path}>{loraLine(item)}</p>
          ))}
        </MetaCard>
      ) : null}
    </div>
  )
}
