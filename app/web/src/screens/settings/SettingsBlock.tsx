import type { ReactNode } from 'react'

export function matchesSetting(query: string, ...parts: string[]) {
  const q = query.trim().toLowerCase()
  return !q || parts.join(' ').toLowerCase().includes(q)
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
  if (!matchesSetting(query, title, terms)) {
    return null
  }
  return (
    <section id={id} className="settings-card flex flex-col gap-3 rounded-md border border-line bg-panel p-2">
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
