import type { ReactNode } from 'react'

export function matchesSetting(query: string, ...parts: string[]) {
  const q = query.trim().toLowerCase()
  return !q || parts.join(' ').toLowerCase().includes(q)
}

export function SettingsBlock({
  query,
  title,
  terms = '',
  className = 'flex flex-col gap-3',
  children,
}: {
  query: string
  title: string
  terms?: string
  className?: string
  children: ReactNode
}) {
  if (!matchesSetting(query, title, terms)) {
    return null
  }
  return (
    <section className={className}>
      <h2 className="text-xs text-label">{title}</h2>
      {children}
    </section>
  )
}
