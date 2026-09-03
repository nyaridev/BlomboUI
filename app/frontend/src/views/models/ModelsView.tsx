import { CivitaiPanel } from '@/views/models/panels/civitai/CivitaiPanel.tsx'
import { LocalModelsPanel, type LocalKindTab } from '@/views/models/panels/local/LocalModelsPanel.tsx'
import { ManagerPanel } from '@/views/models/panels/manager/ManagerPanel.tsx'
import { SegmentSwitch } from '@/components/controls/button/SegmentSwitch.tsx'
import { TabsList, TabsTrigger } from '@/components/controls/tabs/TabsControl.tsx'
import { useSettingsStore } from '@/stores/settingsStore.ts'

const PAGE_TABS = ['Local', 'CivitAI', 'Manager'] as const
const KIND_TABS = [
  { id: 'all', label: 'All' },
  { id: 'checkpoints', label: 'Base Model' },
  { id: 'loras', label: 'LoRA' },
  { id: 'wildcards', label: 'Wildcards' },
  { id: 'other', label: 'Other' },
] as const

type PageTab = (typeof PAGE_TABS)[number]

export function ModelsView() {
  const tab = useSettingsStore((s) => s.modelsTab)
  const setTab = useSettingsStore((s) => s.setModelsTab)
  const kind = useSettingsStore((s) => s.modelsKind)
  const setKind = useSettingsStore((s) => s.setModelsKind)
  const page = PAGE_TABS.includes(tab as PageTab) ? (tab as PageTab) : 'Local'
  const shownKind: LocalKindTab = KIND_TABS.some((item) => item.id === kind) ? (kind as LocalKindTab) : 'all'

  return (
    <div className="flex h-full min-h-0 flex-col px-10 py-4">
      <TabsList value={page} onValueChange={(value) => setTab(value as PageTab)} className="flex shrink-0 gap-cluster">
        {PAGE_TABS.map((item) => (
          <TabsTrigger key={item} value={item} active={page === item}>
            {item}
          </TabsTrigger>
        ))}
      </TabsList>
      <div className="flex min-h-0 flex-1 flex-col rounded-b-md rounded-tr-md border border-line bg-panel p-3">
        {page === 'CivitAI' ? (
          <CivitaiPanel />
        ) : page === 'Manager' ? (
          <ManagerPanel />
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="mb-2 flex h-toolbar shrink-0">
              <SegmentSwitch value={shownKind} tone="blue" options={[...KIND_TABS]} onChange={setKind} />
            </div>
            <div className="min-h-0 flex-1">
              <LocalModelsPanel kind={shownKind} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
