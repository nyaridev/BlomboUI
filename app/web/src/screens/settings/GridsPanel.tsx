import { SliderField } from '@/components/SliderField.tsx'
import { SettingsBlock, SettingsCard } from './SettingsBlock.tsx'
import { useSettingsStore } from '@/stores/settingsStore.ts'

export const GRIDS_QUERY =
  'grids batch grid contact sheet jpg jpeg quality max images row count empty gaps fill cancel cancelled interrupted skip unfinished'

export function GridsPanel({ query = '' }: { query?: string }) {
  const batchGrid = useSettingsStore((s) => s.batchGrid)
  const batchGridMax = useSettingsStore((s) => s.batchGridMax)
  const batchGridQuality = useSettingsStore((s) => s.batchGridQuality)
  const batchGridRows = useSettingsStore((s) => s.batchGridRows)
  const batchGridFill = useSettingsStore((s) => s.batchGridFill)
  const batchGridOnCancel = useSettingsStore((s) => s.batchGridOnCancel)
  const saveInterrupted = useSettingsStore((s) => s.saveInterrupted)
  const interruptedInGrid = useSettingsStore((s) => s.interruptedInGrid)
  const setBatchGrid = useSettingsStore((s) => s.setBatchGrid)
  const setBatchGridMax = useSettingsStore((s) => s.setBatchGridMax)
  const setBatchGridQuality = useSettingsStore((s) => s.setBatchGridQuality)
  const setBatchGridRows = useSettingsStore((s) => s.setBatchGridRows)
  const setBatchGridFill = useSettingsStore((s) => s.setBatchGridFill)
  const setBatchGridOnCancel = useSettingsStore((s) => s.setBatchGridOnCancel)
  const setInterruptedInGrid = useSettingsStore((s) => s.setInterruptedInGrid)
  const interruptedGridOn = batchGrid && saveInterrupted

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <SettingsCard
        query={query}
        title="Batch grid"
        terms="contact sheet jpg jpeg save show first preview overview cancel cancelled interrupted skip unfinished"
      >
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="check"
            checked={batchGrid}
            onChange={(e) => setBatchGrid(e.target.checked)}
          />
          Save a grid of images after generating a batch
        </label>
        <p className="text-xs text-muted">
          The grid opens first in the viewer so you can scan the batch before flipping through each image.
        </p>
        <label className={['flex items-center gap-2 text-sm', batchGrid ? 'text-ink' : 'text-muted'].join(' ')}>
          <input
            type="checkbox"
            className="check"
            checked={batchGridOnCancel}
            disabled={!batchGrid}
            onChange={(e) => setBatchGridOnCancel(e.target.checked)}
          />
          Save a grid of finished images if generation is cancelled
        </label>
        <p className="text-xs text-muted">
          Cancel still builds a contact sheet from images that already completed, as long as at least two exist.
        </p>
        <label className={['flex items-center gap-2 text-sm', interruptedGridOn ? 'text-ink' : 'text-muted'].join(' ')}>
          <input
            type="checkbox"
            className="check"
            checked={interruptedInGrid}
            disabled={!interruptedGridOn}
            onChange={(e) => setInterruptedInGrid(e.target.checked)}
          />
          Include interrupted images in the grid
        </label>
        <p className="text-xs text-muted">
          On by default. Skip and cancel still put the unfinished preview into the contact sheet when it is saved.
        </p>
      </SettingsCard>
      <SettingsCard query={query} title="Layout" terms="max images sheet jpeg quality row count empty gaps fill">
        <SettingsBlock query={query} title="Max images in sheet" terms="grid size split extra">
          <SliderField value={batchGridMax} onChange={setBatchGridMax} min={2} max={100} />
          <p className="text-xs text-muted">
            Extra images start another sheet — 16 shots with a max of 12 become two grids.
          </p>
        </SettingsBlock>
        <SettingsBlock query={query} title="JPEG quality" terms="grid jpg">
          <SliderField value={batchGridQuality} onChange={setBatchGridQuality} min={40} max={95} />
        </SettingsBlock>
        <SettingsBlock query={query} title="Grid row count" terms="layout 25x25 auto">
          <SliderField value={batchGridRows} onChange={setBatchGridRows} min={0} max={25} />
          <p className="text-xs text-muted">0 picks a near-square layout from the image size.</p>
        </SettingsBlock>
        <SettingsBlock query={query} title="Empty gaps" terms="prevent fill long line">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="check"
              checked={batchGridFill}
              onChange={(e) => setBatchGridFill(e.target.checked)}
            />
            Prevent empty gaps within a grid
          </label>
          <p className="text-xs text-muted">
            Off keeps a near-square sheet (11 shots can be 4×3 with a hole). On packs without holes — 11 shots become a
            single line.
          </p>
        </SettingsBlock>
      </SettingsCard>
    </div>
  )
}
