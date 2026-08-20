import { AppIcon } from '@/components/AppIcon.tsx'

export type SettingsNavGroup = {
  title: string
  pages: { id: string; danger?: boolean; icon?: string }[]
}

export function SettingsNav({
  groups,
  page,
  onOpen,
}: {
  groups: SettingsNavGroup[]
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
              {item.id}
            </button>
          ))}
        </div>
      ))}
    </nav>
  )
}
