import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { ModelPickTile } from '@/components/composites/models/ModelPickTile.tsx'
import { IconButton } from '@/components/controls/button/IconButton.tsx'
import { useModelsStore } from '@/stores/modelsStore.ts'

type CheckpointFieldProps = {
  value: string
  onChange: (value: string) => void
  refresh?: boolean
}

export function CheckpointField({ value, onChange, refresh = false }: CheckpointFieldProps) {
  const busy = useModelsStore((s) => s.busy)
  const refreshModels = useModelsStore((s) => s.refresh)

  return (
    <div className="flex min-w-0 items-end gap-cluster">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-xs text-muted">Model</span>
        <ModelPickTile kind="checkpoints" role="Checkpoint" value={value} onChange={onChange} chromeKey="primitives-checkpoint" />
      </div>
      {refresh ? (
        <IconButton
          aria-label="Refresh models"
          title="Refresh models (R)"
          disabled={busy}
          onClick={() => void refreshModels()}
        >
          <AppIcon id="refresh-cw" />
        </IconButton>
      ) : null}
    </div>
  )
}
