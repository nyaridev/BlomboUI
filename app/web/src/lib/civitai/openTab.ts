import { loadCivitaiPage } from '@/lib/civitai/pageCache.ts'
import { pickVersionId } from '@/lib/civitai/version.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'

let flashHandler: ((id: number) => void) | null = null

export function setCivitaiTabFlashHandler(handler: ((id: number) => void) | null) {
  flashHandler = handler
}

export function openCivitaiModelTab(
  item: { id: number; name: string; versions?: { id: number; baseModel?: string }[] },
  focus = false,
  versionId?: number,
) {
  const store = useSettingsStore.getState()
  const current = store.civitaiTabs
  const initialVersionId = versionId ?? pickVersionId(item.versions || [], store.civitaiBrowse.baseModels)
  const existing = current.find((tab) => tab.id === item.id)
  const tab = existing
    ? versionId !== undefined && existing.versionId !== versionId
      ? { ...existing, versionId, initialVersionId: existing.initialVersionId ?? versionId }
      : existing
    : {
        id: item.id,
        name: item.name,
        ...(initialVersionId === undefined ? {} : { initialVersionId, versionId: initialVersionId }),
      }
  const alreadyLast = current[current.length - 1]?.id === item.id
  if (!existing || !alreadyLast || tab !== existing) {
    store.setCivitaiTabs([...current.filter((row) => row.id !== item.id), tab])
  }
  void loadCivitaiPage(item.id, store.civitaiBrowse.baseModels)
  if (focus) {
    store.setCivitaiTabId(item.id)
  }
  flashHandler?.(item.id)
}

export function openInCivitaiBrowser(item: { id: number; name: string }, versionId?: number) {
  useSettingsStore.getState().setModelsTab('CivitAI')
  openCivitaiModelTab(item, true, versionId)
}
