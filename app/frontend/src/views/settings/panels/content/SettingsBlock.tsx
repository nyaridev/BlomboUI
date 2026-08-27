import type { ReactNode } from 'react'
import type { SettingsKey } from '@/stores/settingsStore.ts'
import { SettingsReset } from '@/views/settings/panels/content/SettingsReset.tsx'

export function matchesSetting(query: string, ...parts: string[]) {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!tokens.length) {
    return true
  }
  const hay = parts.join(' ').toLowerCase()
  return tokens.every((token) => hay.includes(token))
}

function Header({
  title,
  action,
  setting,
  field,
}: {
  title: string
  action?: ReactNode
  setting?: SettingsKey
  field?: string
}) {
  if (!action && !setting) {
    return <h2 className="text-xs text-label">{title}</h2>
  }
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-xs text-label">{title}</h2>
      <div className="flex items-center gap-1">
        {action}
        {setting ? <SettingsReset setting={setting} field={field} /> : null}
      </div>
    </div>
  )
}

export function SettingsCard({
  query,
  title,
  terms = '',
  id,
  action,
  setting,
  field,
  children,
}: {
  query: string
  title: string
  terms?: string
  id?: string
  action?: ReactNode
  setting?: SettingsKey
  field?: string
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
      <Header title={title} action={action} setting={setting} field={field} />
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
  setting,
  field,
  children,
}: {
  query: string
  title: string
  terms?: string
  id?: string
  className?: string
  setting?: SettingsKey
  field?: string
  children: ReactNode
}) {
  if (!matchesSetting(query, title, terms)) {
    return null
  }
  return (
    <section id={id} className={`settings-block ${className}`}>
      <Header title={title} setting={setting} field={field} />
      {children}
    </section>
  )
}
