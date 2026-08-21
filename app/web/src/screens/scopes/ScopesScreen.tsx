import { useState } from 'react'
import { ScopesEditor } from './ScopesEditor.tsx'
import { ScopeGroups } from './ScopeGroups.tsx'
import { ScopeLookup } from './ScopeLookup.tsx'

const TABS = ['Scopes', 'Groups', 'Lookup'] as const

type Tab = (typeof TABS)[number]

export function ScopesScreen() {
  const [tab, setTab] = useState<Tab>('Scopes')
  const [openId, setOpenId] = useState('')

  function editScope(id: string) {
    setOpenId(id)
    setTab('Scopes')
  }

  return (
    <div className="flex h-full min-h-0 flex-col px-10 py-4">
      <div className="flex shrink-0 gap-1">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            className={[
              '-mb-px rounded-t-md border px-3 py-1.5 text-sm',
              tab === item
                ? 'border-line border-b-panel bg-panel text-ink'
                : 'border-transparent text-muted hover:text-ink',
            ].join(' ')}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col rounded-b-md rounded-tr-md border border-line bg-panel p-3">
        {tab === 'Scopes' ? <ScopesEditor openId={openId} onOpenId={setOpenId} /> : null}
        {tab === 'Groups' ? <ScopeGroups onEditScope={editScope} /> : null}
        {tab === 'Lookup' ? <ScopeLookup onEditScope={editScope} /> : null}
      </div>
    </div>
  )
}
