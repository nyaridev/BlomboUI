import { ExpandSection } from '@/components/ExpandSection.tsx'
import type { CivitaiVersion } from '@/lib/api.ts'
import { useCivitaiData } from './CivitaiLayouts.tsx'
import { SafetensorsDashboard } from './SafetensorsLayouts.tsx'
import { trainingGroups, type SafetensorsMeta } from './safetensors.ts'

type SafetensorsInfoProps = {
  metadata: SafetensorsMeta | null
  error: string | null
  busy: boolean
  civitai: CivitaiVersion | null
  civitaiStatus: 'idle' | 'looking' | 'found' | 'none'
}

export function SafetensorsInfo({ metadata, error, busy, civitai, civitaiStatus }: SafetensorsInfoProps) {
  const data = useCivitaiData(civitaiStatus === 'found' ? civitai : null)
  if (busy && !metadata) {
    return <p className="text-sm text-muted">Reading…</p>
  }
  if (error) {
    return <p className="text-sm text-ink">{error}</p>
  }
  const groups = metadata ? trainingGroups(metadata) : []
  const raw = metadata && Object.keys(metadata).length ? JSON.stringify(metadata, null, 2) : ''

  return (
    <div className="flex flex-col gap-4">
      <SafetensorsDashboard data={data} groups={groups} raw={raw} />
      {raw ? (
        <ExpandSection title="Raw metadata">
          <pre className="whitespace-pre-wrap break-words font-mono text-xs text-ink">{raw}</pre>
        </ExpandSection>
      ) : null}
    </div>
  )
}
