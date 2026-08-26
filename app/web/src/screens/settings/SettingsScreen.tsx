import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { PaneSplitter } from '@/components/chrome/PaneSplitter.tsx'
import { AuthorAliasesPanel, AUTHOR_ALIASES_QUERY } from './AuthorAliasesPanel.tsx'
import { GeneralPanel, GENERAL_QUERY } from './GeneralPanel.tsx'
import { DownloadPanel, DOWNLOAD_QUERY } from './DownloadPanel.tsx'
import { HistoryPanel, HISTORY_QUERY } from './HistoryPanel.tsx'
import { GalleryPanel, GALLERY_QUERY } from './GalleryPanel.tsx'
import { GridsPanel, GRIDS_QUERY } from './GridsPanel.tsx'
import { GenerationPanel, GENERATION_QUERY } from './GenerationPanel.tsx'
import { ModelsPanel, MODELS_QUERY } from './ModelsPanel.tsx'
import { BrowsePanel, CIVITAI_BROWSE_QUERY } from './BrowsePanel.tsx'
import { LabelsPanel, CIVITAI_LABELS_QUERY } from './LabelsPanel.tsx'
import { CivitaiAccountPanel, CivitaiPanel, CIVITAI_ACCOUNT_QUERY, CIVITAI_QUERY } from './CivitaiPanel.tsx'
import { PrimitivesPanel } from './PrimitivesPanel.tsx'
import { DirectoriesPanel, DIRECTORIES_QUERY } from './DirectoriesPanel.tsx'
import { SavingPanel, SAVING_QUERY } from './SavingPanel.tsx'
import { ShortcutsPanel, SHORTCUTS_QUERY } from './ShortcutsPanel.tsx'
import { TabsPanel, TABS_QUERY } from './TabsPanel.tsx'
import { AutocompleteGeneralPanel, AutocompletePanel, AUTOCOMPLETE_GENERAL_QUERY, AUTOCOMPLETE_QUERY } from './AutocompletePanel.tsx'
import { FrequentTagsPanel, FREQUENT_TAGS_QUERY } from './FrequentTagsPanel.tsx'
import { RemovedPanel, REMOVED_QUERY } from './RemovedPanel.tsx'
import { ThumbnailsPanel, THUMBNAILS_QUERY } from './ThumbnailsPanel.tsx'
import { matchesSetting } from './SettingsBlock.tsx'
import { pageLabel, SettingsNav } from './SettingsNav.tsx'
import { useSettingsHighlight } from './useSettingsHighlight.ts'

const NAV_REM = 12
const NAV_MIN_REM = 10

const GROUPS = [
  {
    title: 'General',
    pages: [
      { id: 'Appearance', terms: GENERAL_QUERY, Panel: GeneralPanel },
      { id: 'Tabs', terms: TABS_QUERY, Panel: TabsPanel },
      { id: 'Pickers', terms: GALLERY_QUERY, Panel: GalleryPanel },
    ],
  },
  {
    title: 'Generate',
    pages: [
      { id: 'Generation', terms: GENERATION_QUERY, Panel: GenerationPanel },
      { id: 'Grids', terms: GRIDS_QUERY, Panel: GridsPanel },
    ],
  },
  {
    title: 'Files',
    pages: [
      { id: 'Directories', terms: DIRECTORIES_QUERY, Panel: DirectoriesPanel },
      { id: 'Output', label: 'Saving', terms: SAVING_QUERY, Panel: SavingPanel },
    ],
  },
  {
    title: 'Models',
    pages: [
      { id: 'Models', terms: MODELS_QUERY, Panel: ModelsPanel },
      { id: 'Thumbnails', terms: THUMBNAILS_QUERY, Panel: ThumbnailsPanel },
    ],
  },
  {
    title: 'Civitai',
    pages: [
      { id: 'civitai-account', label: 'Account', terms: CIVITAI_ACCOUNT_QUERY, Panel: CivitaiAccountPanel },
      { id: 'civitai-browse', label: 'Browse', terms: CIVITAI_BROWSE_QUERY, Panel: BrowsePanel },
      { id: 'civitai-labels', label: 'Labels', terms: CIVITAI_LABELS_QUERY, Panel: LabelsPanel },
      { id: 'Download', terms: DOWNLOAD_QUERY, Panel: DownloadPanel },
      { id: 'author-aliases', label: 'Author Aliases', terms: AUTHOR_ALIASES_QUERY, Panel: AuthorAliasesPanel },
      { id: 'History', terms: HISTORY_QUERY, Panel: HistoryPanel },
      { id: 'Metadata', terms: CIVITAI_QUERY, Panel: CivitaiPanel },
    ],
  },
  {
    title: 'Autocomplete',
    pages: [
      { id: 'autocomplete-general', label: 'Behavior', terms: AUTOCOMPLETE_GENERAL_QUERY, Panel: AutocompleteGeneralPanel },
      { id: 'autocomplete-tag-lists', label: 'Tag Lists', terms: AUTOCOMPLETE_QUERY, Panel: AutocompletePanel },
      { id: 'autocomplete-frequent-tags', label: 'Frequent Tags', terms: FREQUENT_TAGS_QUERY, Panel: FrequentTagsPanel },
    ],
  },
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
  const [page, setPage] = useState<PageId>('Appearance')
  const searching = query.trim().length > 0
  const groups = useMemo(
    () =>
      GROUPS.map((group) => ({
        ...group,
        pages: group.pages.filter((item) => {
          if (query.trim() && 'search' in item && item.search === false) {
            return false
          }
          return matchesSetting(query, item.id, pageLabel(item), item.terms)
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

  useSettingsHighlight({
    pathname: location.pathname,
    hash: location.hash,
    page,
    searching,
    setPage: setPage as (id: string) => void,
    setQuery,
  })

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
                {searching ? <h1 className="text-sm font-medium text-ink">{pageLabel(item)}</h1> : null}
                <item.Panel query={query} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
