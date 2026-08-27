import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { TabsList, TabsTrigger } from '@/components/controls/tabs/TabsControl.tsx'
import { ScopesEditor } from '@/views/scopes/panels/editor/ScopesEditor.tsx'
import { ScopeGroups } from '@/views/scopes/panels/groups/ScopeGroups.tsx'
import { ScopeLookup } from '@/views/scopes/panels/lookup/ScopeLookup.tsx'

const TABS = ['Scopes', 'Groups', 'Lookup'] as const

type Tab = (typeof TABS)[number]

export function ScopesView() {
  const visible = useLocation().pathname === '/scopes'
  const [tab, setTab] = useState<Tab>('Scopes')
  const [openId, setOpenId] = useState('')

  function editScope(id: string) {
    setOpenId(id)
    setTab('Scopes')
  }

  return (
    <div className="flex h-full min-h-0 flex-col px-10 py-4">
      <TabsList value={tab} onValueChange={(value) => setTab(value as Tab)} className="flex shrink-0 gap-cluster">
        {TABS.map((item) => (
          <TabsTrigger key={item} value={item} active={tab === item}>
            {item}
          </TabsTrigger>
        ))}
      </TabsList>
      <div className="flex min-h-0 flex-1 flex-col rounded-b-md rounded-tr-md border border-line bg-panel p-3">
        {tab === 'Scopes' ? <ScopesEditor openId={openId} onOpenId={setOpenId} /> : null}
        {tab === 'Groups' ? <ScopeGroups active={visible} onEditScope={editScope} /> : null}
        {tab === 'Lookup' ? <ScopeLookup active={visible} onEditScope={editScope} /> : null}
      </div>
    </div>
  )
}
