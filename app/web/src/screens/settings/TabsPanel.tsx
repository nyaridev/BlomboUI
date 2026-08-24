import { ChipSelect } from '@/components/primitives/ChipSelect.tsx'
import { HIDEABLE_MAIN_TABS, ORDERABLE_MAIN_TABS, type HideableMainTab, type OrderableMainTab } from '@/app/appTabs.ts'
import { GENERATE_TABS, HIDEABLE_GENERATE_TABS, type GenerateTab } from '@/screens/generate/tabs.ts'
import { SettingsBlock, SettingsCard } from './SettingsBlock.tsx'
import { useSettingsStore } from '@/stores/settingsStore.ts'

export const TABS_QUERY =
  'tabs exclude hide order reorder generate main keybind shortcut ctrl alt 1 2 3 4 5 6 7 8 errors settings file info gallery models wildcard manager scopes'

export function TabsPanel({ query = '' }: { query?: string }) {
  const hiddenGenerateTabs = useSettingsStore((s) => s.hiddenGenerateTabs) ?? []
  const hiddenMainTabs = useSettingsStore((s) => s.hiddenMainTabs) ?? []
  const mainTabOrder = useSettingsStore((s) => s.mainTabOrder)
  const generateTabOrder = useSettingsStore((s) => s.generateTabOrder)
  const mainTabKeysFollowLayout = useSettingsStore((s) => s.mainTabKeysFollowLayout)
  const generateTabKeysFollowLayout = useSettingsStore((s) => s.generateTabKeysFollowLayout)
  const setHiddenGenerateTabs = useSettingsStore((s) => s.setHiddenGenerateTabs)
  const setHiddenMainTabs = useSettingsStore((s) => s.setHiddenMainTabs)
  const setMainTabOrder = useSettingsStore((s) => s.setMainTabOrder)
  const setGenerateTabOrder = useSettingsStore((s) => s.setGenerateTabOrder)
  const setMainTabKeysFollowLayout = useSettingsStore((s) => s.setMainTabKeysFollowLayout)
  const setGenerateTabKeysFollowLayout = useSettingsStore((s) => s.setGenerateTabKeysFollowLayout)

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <SettingsCard
        query={query}
        title="Main tabs"
        terms="exclude hide order reorder left generate file info gallery models wildcard manager scopes errors"
      >
        <SettingsBlock query={query} title="Exclude" terms="hide generate file info gallery models wildcard manager scopes errors">
          <ChipSelect
            options={[...HIDEABLE_MAIN_TABS]}
            value={hiddenMainTabs}
            onChange={(value) => setHiddenMainTabs(value as HideableMainTab[])}
            placeholder="Select tabs to hide…"
          />
          <p className="text-xs text-muted">Settings stays visible. Selected tabs leave the header.</p>
        </SettingsBlock>
        <SettingsBlock query={query} title="Order" terms="reorder left generate file info gallery models wildcard manager scopes">
          <ChipSelect
            mode="order"
            options={[...ORDERABLE_MAIN_TABS]}
            value={mainTabOrder}
            onChange={(value) => setMainTabOrder(value as OrderableMainTab[])}
          />
          <p className="text-xs text-muted">Drag to reorder the left header tabs. Errors and Settings stay on the right.</p>
        </SettingsBlock>
      </SettingsCard>
      <SettingsCard
        query={query}
        title="Generate tabs"
        terms="exclude hide order reorder generation base model lora wildcards other hidden"
      >
        <SettingsBlock query={query} title="Exclude" terms="hidden tabs">
          <ChipSelect
            options={[...HIDEABLE_GENERATE_TABS]}
            value={hiddenGenerateTabs.filter((item) => item !== 'Generation')}
            onChange={(value) => setHiddenGenerateTabs(value as GenerateTab[])}
            placeholder="Select tabs to hide…"
          />
          <p className="text-xs text-muted">Selected tabs are hidden on the generate screen.</p>
        </SettingsBlock>
        <SettingsBlock query={query} title="Order" terms="reorder generation base model lora wildcards other">
          <ChipSelect
            mode="order"
            options={[...GENERATE_TABS]}
            value={generateTabOrder}
            onChange={(value) => setGenerateTabOrder(value as GenerateTab[])}
          />
          <p className="text-xs text-muted">Drag to reorder generate tabs.</p>
        </SettingsBlock>
      </SettingsCard>
      <SettingsCard query={query} title="Tab shortcuts" terms="keybind shortcut ctrl alt follow layout 1 2 3 4 5 6 7">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="check"
            checked={mainTabKeysFollowLayout}
            onChange={(e) => setMainTabKeysFollowLayout(e.target.checked)}
          />
          Ctrl+1…8 follow main tab order and exclusions
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="check"
            checked={generateTabKeysFollowLayout}
            onChange={(e) => setGenerateTabKeysFollowLayout(e.target.checked)}
          />
          Alt+1…4 follow generate tab order and exclusions
        </label>
        <p className="text-xs text-muted">Off keeps the original number mapping. Hidden tabs then do nothing.</p>
      </SettingsCard>
    </div>
  )
}
