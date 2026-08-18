import { ChipSelect } from '@/components/ChipSelect.tsx'
import { NumberField } from '@/components/NumberField.tsx'
import { HIDEABLE_GENERATE_TABS, type GenerateTab } from '@/screens/generate/tabs.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'

export function GeneralPanel() {
  const batchGrid = useSettingsStore((s) => s.batchGrid)
  const batchGridMax = useSettingsStore((s) => s.batchGridMax)
  const batchGridQuality = useSettingsStore((s) => s.batchGridQuality)
  const hiddenGenerateTabs = useSettingsStore((s) => s.hiddenGenerateTabs) ?? []
  const setBatchGrid = useSettingsStore((s) => s.setBatchGrid)
  const setBatchGridMax = useSettingsStore((s) => s.setBatchGridMax)
  const setBatchGridQuality = useSettingsStore((s) => s.setBatchGridQuality)
  const setHiddenGenerateTabs = useSettingsStore((s) => s.setHiddenGenerateTabs)

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-xs text-label">Batch grid</h2>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="check"
            checked={batchGrid}
            onChange={(e) => setBatchGrid(e.target.checked)}
          />
          Save a near-square JPG contact sheet and show it first
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Max images in sheet</span>
          <NumberField value={batchGridMax} onChange={setBatchGridMax} min={2} max={64} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">JPEG quality</span>
          <NumberField value={batchGridQuality} onChange={setBatchGridQuality} min={40} max={95} />
        </label>
        <p className="text-xs text-muted">
          Layout picks a grid close to square from the image size — 12 portrait shots become 4×3.
        </p>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-xs text-label">Exclude generate tabs</h2>
        <ChipSelect
          options={[...HIDEABLE_GENERATE_TABS]}
          value={hiddenGenerateTabs.filter((item) => item !== 'Generation')}
          onChange={(value) => setHiddenGenerateTabs(value as GenerateTab[])}
          placeholder="Select tabs to hide…"
        />
        <p className="text-xs text-muted">Selected tabs are hidden on the generate screen.</p>
      </section>
    </div>
  )
}
