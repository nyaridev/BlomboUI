import { SliderField } from '@/components/controls/slider/SliderField.tsx'
import {
  CIVITAI_BROWSE_LIMIT_MAX,
  CIVITAI_BROWSE_LIMIT_MIN,
} from '@/lib/civitai/browse.ts'
import { SettingsCard } from '@/views/settings/panels/content/SettingsBlock.tsx'
import { useSettingsStore } from '@/stores/settingsStore.ts'

export const CIVITAI_BROWSE_QUERY =
  'civitai browse models per load page size limit cards grid infinite scroll search'

export function BrowseSection({ query = '' }: { query?: string }) {
  const limit = useSettingsStore((state) => state.civitaiBrowse.limit)
  const setCivitaiBrowse = useSettingsStore((state) => state.setCivitaiBrowse)

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <SettingsCard query={query} title="Search" terms={CIVITAI_BROWSE_QUERY} id="settings-civitai-browse" setting="civitaiBrowse" field="limit">
        <SliderField
          value={limit}
          onChange={(value) => setCivitaiBrowse({ limit: value })}
          min={CIVITAI_BROWSE_LIMIT_MIN}
          max={CIVITAI_BROWSE_LIMIT_MAX}
        />
        <p className="text-xs text-muted">
          Models fetched each time the CivitAI search grid loads or scrolls for more. CivitAI allows 1 to 100.
        </p>
      </SettingsCard>
    </div>
  )
}
