export type SettingsNavGroup = {
  title: string
  pages: { id: string }[]
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
    <nav className="flex min-h-0 flex-col gap-3 overflow-y-auto">
      {groups.map((group) => (
        <div key={group.title} className="flex flex-col gap-1">
          <div className="px-2.5 text-[10px] font-medium tracking-[0.12em] text-muted uppercase">{group.title}</div>
          {group.pages.map((item) => (
            <button
              key={item.id}
              type="button"
              className={[
                'w-full border-l-2 px-2.5 py-1.5 text-left text-sm',
                page === item.id
                  ? 'border-accent bg-field text-ink'
                  : 'border-transparent text-muted hover:bg-field hover:text-ink',
              ].join(' ')}
              onClick={() => onOpen(item.id)}
            >
              {item.id}
            </button>
          ))}
        </div>
      ))}
    </nav>
  )
}
