import { SelectField } from '@/components/controls/select/SelectField.tsx'
import { SliderField } from '@/components/controls/slider/SliderField.tsx'
import { CheckboxControl } from '@/components/controls/toggle/CheckboxControl.tsx'
import { IMAGE_FORMATS, useSettingsStore, type ImageFormat } from '@/stores/settingsStore.ts'
import { SettingsBlock, SettingsCard } from '@/views/settings/panels/content/SettingsBlock.tsx'
import { SettingsField } from '@/views/settings/panels/content/SettingsReset.tsx'

export const GRIDS_QUERY =
  'grids batch grid contact sheet png jpg jpeg webp format quality max images row count empty gaps fill cancel cancelled interrupted skip unfinished'

export function GridsSection({ query = '' }: { query?: string }) {
  const batchGrid = useSettingsStore((s) => s.batchGrid)
  const batchGridMax = useSettingsStore((s) => s.batchGridMax)
  const batchGridQuality = useSettingsStore((s) => s.batchGridQuality)
  const gridFormat = useSettingsStore((s) => s.gridFormat)
  const batchGridRows = useSettingsStore((s) => s.batchGridRows)
  const batchGridFill = useSettingsStore((s) => s.batchGridFill)
  const batchGridOnCancel = useSettingsStore((s) => s.batchGridOnCancel)
  const saveInterrupted = useSettingsStore((s) => s.saveInterrupted)
  const interruptedInGrid = useSettingsStore((s) => s.interruptedInGrid)
  const setBatchGrid = useSettingsStore((s) => s.setBatchGrid)
  const setBatchGridMax = useSettingsStore((s) => s.setBatchGridMax)
  const setBatchGridQuality = useSettingsStore((s) => s.setBatchGridQuality)
  const setGridFormat = useSettingsStore((s) => s.setGridFormat)
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
        <SettingsField setting="batchGrid">
          <label className="flex items-center gap-2 text-sm text-ink">
            <CheckboxControl checked={batchGrid} onChange={setBatchGrid} />
            Save a grid of images after generating a batch
          </label>
        </SettingsField>
        <p className="text-xs text-muted">
          The grid opens first in the viewer so you can scan the batch before flipping through each image.
        </p>
        <SettingsField setting="batchGridOnCancel">
          <label className={['flex items-center gap-2 text-sm', batchGrid ? 'text-ink' : 'text-muted'].join(' ')}>
            <CheckboxControl checked={batchGridOnCancel} disabled={!batchGrid} onChange={setBatchGridOnCancel} />
            Save a grid of finished images if generation is cancelled
          </label>
        </SettingsField>
        <p className="text-xs text-muted">
          Cancel still builds a contact sheet from images that already completed, as long as at least two exist.
        </p>
        <SettingsField setting="interruptedInGrid">
          <label className={['flex items-center gap-2 text-sm', interruptedGridOn ? 'text-ink' : 'text-muted'].join(' ')}>
            <CheckboxControl checked={interruptedInGrid} disabled={!interruptedGridOn} onChange={setInterruptedInGrid} />
            Include interrupted images in the grid
          </label>
        </SettingsField>
        <p className="text-xs text-muted">
          Off by default. Skip and cancel still put the unfinished preview into the contact sheet when it is saved.
        </p>
      </SettingsCard>
      <SettingsCard query={query} title="Layout" terms="grid max images sheet png jpg jpeg webp format quality row count empty gaps fill">
        <SettingsBlock query={query} title="Max images in sheet" terms="grid size split extra" setting="batchGridMax">
          <SliderField value={batchGridMax} onChange={setBatchGridMax} min={2} max={100} />
          <p className="text-xs text-muted">
            Extra images start another sheet — 16 shots with a max of 12 become two grids.
          </p>
        </SettingsBlock>
        <SettingsBlock query={query} title="Grid format" terms="png jpg jpeg webp extension" setting="gridFormat">
          <SelectField
            value={gridFormat}
            onChange={(value) => setGridFormat(value as ImageFormat)}
            options={[...IMAGE_FORMATS]}
          />
        </SettingsBlock>
        <SettingsBlock query={query} title="Quality" terms="grid jpg jpeg webp quality" setting="batchGridQuality">
          <div className={gridFormat === 'png' ? 'pointer-events-none opacity-40' : ''}>
            <SliderField value={batchGridQuality} onChange={setBatchGridQuality} min={40} max={95} />
          </div>
          <p className="text-xs text-muted">Used for JPEG and WebP grids.</p>
        </SettingsBlock>
        <SettingsBlock query={query} title="Grid row count" terms="layout 25x25 auto" setting="batchGridRows">
          <SliderField value={batchGridRows} onChange={setBatchGridRows} min={0} max={25} />
          <p className="text-xs text-muted">0 picks a square of cells if it fits, otherwise a wider grid.</p>
        </SettingsBlock>
        <SettingsBlock query={query} title="Empty gaps" terms="prevent fill long line" setting="batchGridFill">
          <label className="flex items-center gap-2 text-sm text-ink">
            <CheckboxControl checked={batchGridFill} onChange={setBatchGridFill} />
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
