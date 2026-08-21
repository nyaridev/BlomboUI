import type { ReactNode } from 'react'

export function matchesSetting(query: string, ...parts: string[]) {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!tokens.length) {
    return true
  }
  const hay = parts.join(' ').toLowerCase()
  return tokens.every((token) => hay.includes(token))
}

export function SettingsCard({
  query,
  title,
  terms = '',
  id,
  children,
}: {
  query: string
  title: string
  terms?: string
  id?: string
  children: ReactNode
}) {
  const hit = matchesSetting(query, title, terms)
  const searching = query.trim().length > 0
  return (
    <section
      id={id}
      className={[
        'settings-card flex-col gap-3 rounded-md border border-line bg-panel p-2',
        searching && !hit ? 'hidden has-[.settings-block]:flex' : 'flex',
      ].join(' ')}
    >
      <h2 className="text-xs text-label">{title}</h2>
      {children}
    </section>
  )
}

export function SettingsBlock({
  query,
  title,
  terms = '',
  id,
  className = 'flex flex-col gap-3',
  children,
}: {
  query: string
  title: string
  terms?: string
  id?: string
  className?: string
  children: ReactNode
}) {
  if (!matchesSetting(query, title, terms)) {
    return null
  }
  return (
    <section id={id} className={`settings-block ${className}`}>
      <h2 className="text-xs text-label">{title}</h2>
      {children}
    </section>
  )
}
