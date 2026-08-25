import { loadCivitaiPage } from '@/lib/civitai/pageCache.ts'
import { pickVersionId } from '@/lib/civitai/version.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'

export function openCivitaiModelTab(
  item: { id: number; name: string; versions?: { id: number; baseModel?: string }[] },
  focus = false,
  versionId?: number,
) {
  const store = useSettingsStore.getState()
  const current = store.civitaiTabs
  const initialVersionId = versionId ?? pickVersionId(item.versions || [], store.civitaiBrowse.baseModels)
  const existing = current.find((tab) => tab.id === item.id)
  let next = current
  if (!existing) {
    next = [
      ...current,
      {
        id: item.id,
        name: item.name,
        ...(initialVersionId === undefined ? {} : { initialVersionId, versionId: initialVersionId }),
      },
    ]
  } else if (versionId !== undefined && existing.versionId !== versionId) {
    next = current.map((tab) =>
      tab.id === item.id ? { ...tab, versionId, initialVersionId: tab.initialVersionId ?? versionId } : tab,
    )
  }
  if (next !== current) {
    store.setCivitaiTabs(next)
  }
  void loadCivitaiPage(item.id, store.civitaiBrowse.baseModels)
  if (focus) {
    store.setCivitaiTabId(item.id)
  }
}

export function openInCivitaiBrowser(item: { id: number; name: string }, versionId?: number) {
  useSettingsStore.getState().setModelsTab('CivitAI')
  openCivitaiModelTab(item, true, versionId)
}
