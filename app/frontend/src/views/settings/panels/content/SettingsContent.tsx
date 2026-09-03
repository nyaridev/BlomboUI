import { pageLabel } from '@/views/settings/panels/sidebar/SettingsSidebar.tsx'
import { GROUPS } from '@/views/settings/panels/content/groups.ts'

type ShownPage = (typeof GROUPS)[number]['pages'][number] & { showAll?: boolean }

export function SettingsContent({
  shown,
  query,
  searching,
}: {
  shown: ShownPage[]
  query: string
  searching: boolean
}) {
  if (shown.length === 0) {
    return <p className="text-sm text-muted">No matching settings.</p>
  }
  return (
    <div className="flex flex-col gap-10">
      {shown.map((item) => (
        <div key={item.id} id={`settings-${item.id}`} className="flex flex-col gap-4">
          {searching ? <h1 className="text-sm font-medium text-ink">{pageLabel(item)}</h1> : null}
          <item.Panel query={item.showAll ? '' : query} />
        </div>
      ))}
    </div>
  )
}
