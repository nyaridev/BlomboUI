import { useState } from 'react'
import { GeneralPanel } from './GeneralPanel.tsx'
import { PrimitivesPanel } from './PrimitivesPanel.tsx'

const sections = ['General', 'Primitives'] as const

type Section = (typeof sections)[number]

export function SettingsScreen() {
  const [section, setSection] = useState<Section>('General')

  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <aside className="flex w-48 shrink-0 flex-col gap-1">
        {sections.map((item) => (
          <button
            key={item}
            type="button"
            className={[
              'rounded px-2.5 py-1.5 text-left text-sm',
              section === item ? 'bg-line text-ink' : 'text-muted hover:text-ink',
            ].join(' ')}
            onClick={() => setSection(item)}
          >
            {item}
          </button>
        ))}
      </aside>
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">
        {section === 'General' ? <GeneralPanel /> : <PrimitivesPanel />}
      </div>
    </div>
  )
}
