import { RefreshIcon } from '@/components/RefreshIcon.tsx'
import { SelectField } from '@/components/SelectField.tsx'
import { modelLabel, modelPath, useModelsStore } from '@/stores/modelsStore.ts'
import { useEffect, useMemo } from 'react'

type CheckpointFieldProps = {
  value: string
  onChange: (value: string) => void
  refresh?: boolean
}

export function CheckpointField({ value, onChange, refresh = false }: CheckpointFieldProps) {
  const checkpoints = useModelsStore((s) => s.checkpoints)
  const busy = useModelsStore((s) => s.busy)
  const refreshModels = useModelsStore((s) => s.refresh)
  const paths = useMemo(() => checkpoints.map(modelPath).filter(Boolean), [checkpoints])
  const options = useMemo(() => {
    const current = typeof value === 'string' ? value : ''
    const ids = current && !paths.includes(current) ? [current, ...paths] : paths
    return ids.map((id) => ({ value: id, label: modelLabel(id) }))
  }, [paths, value])

  useEffect(() => {
    if (!paths.length || typeof value !== 'string' || paths.includes(value)) {
      return
    }
    const base = value.split(/[\\/]/).pop()
    const hits = paths.filter((id) => id.split(/[\\/]/).pop() === base)
    if (hits.length === 1) {
      onChange(hits[0])
    }
  }, [paths, onChange, value])

  return (
    <div className="flex min-w-0 items-end gap-1">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-xs text-muted">Model</span>
        <SelectField value={value} onChange={onChange} options={options} />
      </div>
      {refresh ? (
        <button
          type="button"
          className="icon-btn"
          aria-label="Refresh models"
          title="Refresh models (R)"
          disabled={busy}
          onClick={() => void refreshModels()}
        >
          <RefreshIcon />
        </button>
      ) : null}
    </div>
  )
}
