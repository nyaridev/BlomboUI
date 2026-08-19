import { useEffect, useMemo, useRef, useState } from 'react'
import { PaneSplitter } from '@/components/PaneSplitter.tsx'
import { GeneralPanel, GENERAL_QUERY } from './GeneralPanel.tsx'
import { GridsPanel, GRIDS_QUERY } from './GridsPanel.tsx'
import { PrimitivesPanel } from './PrimitivesPanel.tsx'
import { matchesSetting } from './SettingsBlock.tsx'
import { SettingsNav } from './SettingsNav.tsx'

const NAV_REM = 12
const NAV_MIN_REM = 10

const GROUPS = [
  {
    title: 'General',
    pages: [
      { id: 'General', terms: GENERAL_QUERY, Panel: GeneralPanel },
      { id: 'Grids', terms: GRIDS_QUERY, Panel: GridsPanel },
    ],
  },
  { title: 'Other', pages: [{ id: 'Primitives', terms: '', search: false, Panel: PrimitivesPanel }] },
] as const

type PageId = (typeof GROUPS)[number]['pages'][number]['id']

function remPx() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

function SearchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <circle cx="5" cy="5" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7.4 7.4 10.2 10.2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function SettingsScreen() {
  const rowRef = useRef<HTMLDivElement>(null)
  const [navWidth, setNavWidth] = useState(() => NAV_REM * 16)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState<PageId>('General')
  const searching = query.trim().length > 0
  const groups = useMemo(
    () =>
      GROUPS.map((group) => ({
        ...group,
        pages: group.pages.filter((item) => {
          if (query.trim() && 'search' in item && item.search === false) {
            return false
          }
          return matchesSetting(query, item.id, item.terms)
        }),
      })).filter((group) => group.pages.length > 0),
    [query],
  )
  const shown = useMemo(() => {
    const pages = groups.flatMap((group) => group.pages)
    if (searching) {
      return pages
    }
    return pages.filter((item) => item.id === page)
  }, [groups, page, searching])

  useEffect(() => {
    setNavWidth(NAV_REM * remPx())
  }, [])

  useEffect(() => {
    if (shown.some((item) => item.id === page)) {
      return
    }
    const first = shown[0]
    if (first) {
      setPage(first.id)
    }
  }, [page, shown])

  function openPage(id: string) {
    setPage(id as PageId)
    if (searching) {
      document.getElementById(`settings-${id}`)?.scrollIntoView({ block: 'start' })
    }
  }

  return (
    <div ref={rowRef} className="flex h-full min-h-0 px-10 py-4">
      <aside className="flex min-h-0 shrink-0 flex-col gap-3 pr-3" style={{ width: navWidth }}>
        <div className="relative h-8 shrink-0">
          <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-muted">
            <SearchIcon />
          </span>
          <input
            className="h-full w-full rounded border border-line bg-field py-0 pr-2 pl-7 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search settings…"
          />
        </div>
        <SettingsNav groups={groups} page={page} onOpen={openPage} />
      </aside>
      <PaneSplitter
        value={navWidth}
        onChange={setNavWidth}
        onReset={() => setNavWidth(NAV_REM * remPx())}
        min={NAV_MIN_REM * remPx()}
        containerRef={rowRef}
      />
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto pl-4">
        {shown.length === 0 ? (
          <p className="text-sm text-muted">No matching settings.</p>
        ) : (
          <div className="flex flex-col gap-10">
            {shown.map((item) => (
              <div key={item.id} id={`settings-${item.id}`} className="flex flex-col gap-4">
                {searching ? <h1 className="text-sm font-medium text-ink">{item.id}</h1> : null}
                <item.Panel query={query} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
