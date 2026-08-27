import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'

export type SettingsSidebarGroup = {
  title: string
  pages: { id: string; label?: string; danger?: boolean; icon?: string }[]
}

export function pageLabel(item: { id: string; label?: string }) {
  return item.label || item.id
}

export function SettingsSidebar({
  groups,
  page,
  onOpen,
}: {
  groups: SettingsSidebarGroup[]
  page: string
  onOpen: (id: string) => void
}) {
  return (
    <nav className="settings-nav">
      {groups.map((group) => (
        <div key={group.title} className="settings-nav-group">
          <div className="settings-nav-label">{group.title}</div>
          {group.pages.map((item) => (
            <button
              key={item.id}
              type="button"
              className={[
                'settings-nav-item',
                item.danger ? 'is-danger' : '',
                page === item.id ? 'is-active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onOpen(item.id)}
            >
              {item.icon ? <AppIcon id={item.icon} size={14} /> : null}
              {pageLabel(item)}
            </button>
          ))}
        </div>
      ))}
    </nav>
  )
}
