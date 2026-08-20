import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AppIcon } from '@/components/AppIcon.tsx'
import { PaneSplitter } from '@/components/PaneSplitter.tsx'
import { GeneralPanel, GENERAL_QUERY } from './GeneralPanel.tsx'
import { GalleryPanel, GALLERY_QUERY } from './GalleryPanel.tsx'
import { GridsPanel, GRIDS_QUERY } from './GridsPanel.tsx'
import { ModelsPanel, MODELS_QUERY } from './ModelsPanel.tsx'
import { CivitaiPanel, CIVITAI_QUERY } from './CivitaiPanel.tsx'
import { PrimitivesPanel } from './PrimitivesPanel.tsx'
import { DirectoriesPanel, DIRECTORIES_QUERY } from './DirectoriesPanel.tsx'
import { SavingPanel, SAVING_QUERY } from './SavingPanel.tsx'
import { OutputGalleryPanel, OUTPUT_GALLERY_QUERY } from './OutputGalleryPanel.tsx'
import { ShortcutsPanel, SHORTCUTS_QUERY } from './ShortcutsPanel.tsx'
import { TabsPanel, TABS_QUERY } from './TabsPanel.tsx'
import { WildcardsPanel, WILDCARDS_QUERY } from './WildcardsPanel.tsx'
import { RemovedPanel, REMOVED_QUERY } from './RemovedPanel.tsx'
import { matchesSetting } from './SettingsBlock.tsx'
import { SettingsNav } from './SettingsNav.tsx'

const NAV_REM = 12
const NAV_MIN_REM = 10

const GROUPS = [
  {
    title: 'General',
    pages: [
      { id: 'General', terms: GENERAL_QUERY, Panel: GeneralPanel },
      { id: 'Tabs', terms: TABS_QUERY, Panel: TabsPanel },
      { id: 'Grids', terms: GRIDS_QUERY, Panel: GridsPanel },
      { id: 'Gallery', terms: OUTPUT_GALLERY_QUERY, Panel: OutputGalleryPanel },
      { id: 'Gallery View', terms: GALLERY_QUERY, Panel: GalleryPanel },
    ],
  },
  {
    title: 'Output',
    pages: [
      { id: 'Directories', terms: DIRECTORIES_QUERY, Panel: DirectoriesPanel },
      { id: 'Output', terms: SAVING_QUERY, Panel: SavingPanel },
    ],
  },
  {
    title: 'Models',
    pages: [
      { id: 'Models', terms: MODELS_QUERY, Panel: ModelsPanel },
      { id: 'Metadata', terms: CIVITAI_QUERY, Panel: CivitaiPanel },
    ],
  },
  { title: 'Wildcards', pages: [{ id: 'Wildcards', terms: WILDCARDS_QUERY, Panel: WildcardsPanel }] },
  {
    title: 'Other',
    pages: [
      { id: 'Shortcuts', terms: SHORTCUTS_QUERY, Panel: ShortcutsPanel },
      { id: 'Primitives', terms: '', search: false, Panel: PrimitivesPanel },
      { id: 'Trash', terms: REMOVED_QUERY, Panel: RemovedPanel, danger: true, icon: 'trash-2' },
    ],
  },
] as const

type PageId = (typeof GROUPS)[number]['pages'][number]['id']

function remPx() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

export function SettingsScreen() {
  const location = useLocation()
  const rowRef = useRef<HTMLDivElement>(null)
  const [navWidth, setNavWidth] = useState(() => NAV_REM * 16)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState<PageId>('General')
  const searching = query.trim().length > 0
  const highlightPlaceholders = location.pathname === '/settings' && location.hash === '#placeholders'
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
    if (!highlightPlaceholders) {
      return
    }
    setQuery('')
    setPage('Output')
  }, [highlightPlaceholders])

  useLayoutEffect(() => {
    if (!highlightPlaceholders || page !== 'Output' || searching) {
      return
    }
    const run = () => {
      const el = document.getElementById('settings-placeholders')
      if (!el) {
        return
      }
      el.scrollIntoView({ block: 'center' })
      el.classList.remove('settings-glow')
      void el.offsetWidth
      el.classList.add('settings-glow')
    }
    let inner = 0
    const frame = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(run)
    })
    const hide = window.setTimeout(() => {
      document.getElementById('settings-placeholders')?.classList.remove('settings-glow')
    }, 450)
    return () => {
      window.cancelAnimationFrame(frame)
      window.cancelAnimationFrame(inner)
      window.clearTimeout(hide)
    }
  }, [highlightPlaceholders, page, searching])

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
            <AppIcon id="search" size={12} />
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
