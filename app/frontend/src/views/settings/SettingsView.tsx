import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { PaneSplitter } from '@/components/controls/resizable-panel/PaneSplitter.tsx'
import { TextField } from '@/components/controls/input/TextField.tsx'
import { GROUPS, type PageId } from '@/views/settings/panels/content/groups.ts'
import { SettingsContent } from '@/views/settings/panels/content/SettingsContent.tsx'
import { matchesSetting } from '@/views/settings/panels/content/SettingsBlock.tsx'
import { pageLabel, SettingsSidebar } from '@/views/settings/panels/sidebar/SettingsSidebar.tsx'
import { useSettingsHighlight } from '@/views/settings/panels/content/useSettingsHighlight.ts'

const NAV_REM = 12
const NAV_MIN_REM = 10

function remPx() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

export function SettingsView() {
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
        <div className="relative h-toolbar shrink-0">
          <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-muted">
            <AppIcon id="search" size={12} />
          </span>
          <TextField
            className="h-full py-0 pl-7"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search settings…"
          />
        </div>
        <SettingsSidebar groups={groups} page={page} onOpen={openPage} />
      </aside>
      <PaneSplitter
        value={navWidth}
        onChange={setNavWidth}
        onReset={() => setNavWidth(NAV_REM * remPx())}
        min={NAV_MIN_REM * remPx()}
        containerRef={rowRef}
      />
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto pl-4">
        <SettingsContent shown={shown} query={query} searching={searching} />
      </div>
    </div>
  )
}
