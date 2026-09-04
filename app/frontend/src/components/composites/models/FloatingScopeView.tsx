import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { TILE_CELL_PAD_REM, TILE_COL_REM, TILE_GAP_REM, TILE_ROW_REM, remPx } from '@/components/composites/gallery/galleryUtils.ts'
import { isTopOverlay, placePanel } from '@/components/composites/models/overlayPanel.ts'
import { TilePreview, TILE_GLOW } from '@/components/composites/models/TilePreview.tsx'
import { IconButton } from '@/components/controls/button/IconButton.tsx'
import { PaneSplitter } from '@/components/controls/resizable-panel/PaneSplitter.tsx'
import type { ThumbScope } from '@/lib/api.ts'
import { memberThumb, thumbSrc } from '@/lib/gallery/scopeThumbs.ts'
import { GLOBAL_SCOPE } from '@/lib/gallery/thumbView.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useThumbnailScopeStore } from '@/stores/thumbnailScopeStore.ts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const ALL_GROUP = 'All'
const UNGROUPED = 'Ungrouped'
const LIST_REM = 12
const LIST_MIN_REM = 8
const PIN_KEY = 'scope-picker'

type FloatingScopeViewProps = {
  selected: string[]
  onSelect: (id: string) => void
  onClose: () => void
  anchor: DOMRect
  query?: string
  onQuery?: (value: string) => void
  retain?: { current: HTMLElement | null }
  emptyMeansGlobal?: boolean
}

export function FloatingScopeView({
  selected,
  onSelect,
  onClose,
  anchor,
  query: queryProp,
  onQuery,
  retain,
  emptyMeansGlobal = true,
}: FloatingScopeViewProps) {
  const items = useThumbnailScopeStore((s) => s.items)
  const thumbs = useThumbnailScopeStore((s) => s.thumbs)
  const load = useThumbnailScopeStore((s) => s.load)
  const loadThumbs = useThumbnailScopeStore((s) => s.loadThumbs)
  const loaded = useThumbnailScopeStore((s) => s.loaded)
  const scopeGroups = useSettingsStore((s) => s.scopeGroups)
  const scopeOrder = useSettingsStore((s) => s.scopeOrder)
  const galleryTileScale = useSettingsStore((s) => s.galleryTileScale)
  const pinSelected = useSettingsStore((s) => s.galleryPinSelected[PIN_KEY] ?? true)
  const setGalleryPinSelected = useSettingsStore((s) => s.setGalleryPinSelected)
  const panelRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const [listWidth, setListWidth] = useState(() => LIST_REM * 16)
  const [group, setGroup] = useState(ALL_GROUP)
  const [localQuery, setLocalQuery] = useState('')
  const query = queryProp ?? localQuery
  const setQuery = onQuery ?? setLocalQuery
  const pos = placePanel(anchor)
  const tileScale = galleryTileScale * 0.5
  const tileW = TILE_COL_REM * tileScale
  const tileH = TILE_ROW_REM * tileScale
  const tileCellW = tileW + TILE_CELL_PAD_REM
  const tileCellH = tileH + TILE_CELL_PAD_REM
  const globalOn = selected.includes(GLOBAL_SCOPE) || (emptyMeansGlobal && selected.length === 0)

  useEffect(() => {
    if (!loaded) {
      void load()
    }
    void loadThumbs()
  }, [load, loadThumbs, loaded])

  useEffect(() => {
    setListWidth(LIST_REM * remPx())
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape' || !isTopOverlay(panelRef.current)) {
        return
      }
      event.stopImmediatePropagation()
      event.preventDefault()
      onClose()
    }
    function onPointer(event: PointerEvent) {
      const node = event.target as Node | null
      if (panelRef.current?.contains(node) || retain?.current?.contains(node)) {
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onPointer, true)
    }
  }, [onClose, retain])

  const groups = useMemo(() => groupNames(items, scopeGroups), [items, scopeGroups])
  const active = group === ALL_GROUP || groups.includes(group) ? group : ALL_GROUP
  const layoutToken = [query, active, pinSelected ? '1' : '0', items.map((item) => item.id).join('\n')].join('\0')
  const pinRef = useRef({ token: layoutToken, selected })
  if (pinRef.current.token !== layoutToken) {
    pinRef.current = { token: layoutToken, selected }
  }
  const pinnedSelected = pinRef.current.selected
  const tiles = useMemo(() => {
    function keep(item: ThumbScope, pinned: boolean) {
      if (item.id === GLOBAL_SCOPE) {
        return false
      }
      return (pinned || inGroup(item, active)) && (pinned || matchesSearch(item, query))
    }
    const rest = orderByIds(
      items.filter((item) => keep(item, false)),
      scopeOrder,
    )
    if (!pinSelected) {
      return rest
    }
    const byId = new Map(items.map((item) => [item.id, item]))
    const pinned = pinnedSelected.flatMap((id) => {
      if (!id || id === GLOBAL_SCOPE) {
        return []
      }
      const item = byId.get(id)
      return item && keep(item, true) ? [item] : []
    })
    const pinnedIds = new Set(pinned.map((item) => item.id))
    return [...pinned, ...rest.filter((item) => !pinnedIds.has(item.id))]
  }, [active, items, pinSelected, pinnedSelected, query, scopeOrder])
  const showGlobal = !query.trim() || 'global'.includes(query.trim().toLowerCase())

  return createPortal(
    <div
      ref={panelRef}
      data-overlay=""
      data-models-picker=""
      className="pointer-events-auto fixed z-[80] flex flex-col overflow-hidden rounded-md border border-line bg-panel p-2 shadow-[0_8px_24px_rgb(0_0_0_/_0.45)]"
      style={pos}
    >
      <div className="flex h-full min-h-0 flex-col gap-2">
        <div className="flex h-toolbar shrink-0 items-stretch gap-cluster">
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-muted">
              <AppIcon id="search" size={12} />
            </span>
            <input
              className="h-full w-full rounded border border-line bg-field py-0 pr-2 pl-7 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search…"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <IconButton
            className={pinSelected ? 'bg-line' : ''}
            aria-label={pinSelected ? 'Unpin selected from top' : 'Pin selected to top'}
            aria-pressed={pinSelected}
            title={pinSelected ? 'Unpin selected from top' : 'Pin selected to top'}
            onClick={() => setGalleryPinSelected(PIN_KEY, !pinSelected)}
          >
            <AppIcon id={pinSelected ? 'eye' : 'eye-off'} />
          </IconButton>
        </div>
        <div ref={rowRef} className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="h-full min-h-0 shrink-0 overflow-y-auto" style={{ width: listWidth }}>
            {[ALL_GROUP, ...groups].map((name) => (
              <button
                key={name}
                type="button"
                className={[
                  'flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
                  name === active ? 'bg-line text-ink' : 'text-muted hover:bg-field hover:text-ink',
                ].join(' ')}
                onClick={() => setGroup(name)}
              >
                <span className="min-w-0 truncate">{name}</span>
              </button>
            ))}
          </div>
          <PaneSplitter
            value={listWidth}
            onChange={setListWidth}
            onReset={() => setListWidth(LIST_REM * remPx())}
            min={LIST_MIN_REM * remPx()}
            containerRef={rowRef}
          />
          <div className="h-full min-h-0 min-w-0 flex-1 overflow-y-auto py-2 pr-2">
            {showGlobal || tiles.length ? (
              <div
                className="grid justify-start"
                style={{
                  gap: `${TILE_GAP_REM}rem`,
                  gridAutoRows: `${tileCellH}rem`,
                  gridTemplateColumns: `repeat(auto-fill, minmax(${tileCellW}rem, ${tileCellW}rem))`,
                }}
              >
                {showGlobal ? (
                  <ScopeTile
                    label="Global"
                    selected={globalOn}
                    src={null}
                    rawSrc={null}
                    onSelect={() => onSelect(GLOBAL_SCOPE)}
                  />
                ) : null}
                {tiles.map((item) => {
                  const thumb = memberThumb(item.id, thumbs, [], [])
                  return (
                    <ScopeTile
                      key={item.id}
                      label={item.name}
                      selected={selected.includes(item.id)}
                      src={thumb ? thumbSrc(thumb) : null}
                      rawSrc={thumb ? thumbSrc(thumb, true) : null}
                      media={thumb?.media}
                      onSelect={() => onSelect(item.id)}
                    />
                  )
                })}
              </div>
            ) : (
              <p className="px-1 text-sm text-muted">No matches</p>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function ScopeTile({
  label,
  selected,
  src,
  rawSrc,
  media,
  onSelect,
}: {
  label: string
  selected: boolean
  src: string | null
  rawSrc: string | null
  media?: string
  onSelect: () => void
}) {
  return (
    <div className="min-w-0 p-1.5">
      <button
        type="button"
        title={label}
        className={['block w-full rounded', selected ? TILE_GLOW : ''].join(' ')}
        onClick={onSelect}
      >
        <TilePreview className="w-full" src={src} rawSrc={rawSrc} mark="?" label={label} selected={selected} media={media} />
      </button>
    </div>
  )
}

function groupNames(items: ThumbScope[], order: string[]) {
  const used = new Set<string>()
  const names: string[] = []
  const counts = new Map<string, number>()
  let ungrouped = 0
  for (const item of items) {
    if (item.id === GLOBAL_SCOPE) {
      continue
    }
    const group = item.group.trim()
    if (!group) {
      ungrouped += 1
      continue
    }
    const key = group.toLowerCase()
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  for (const name of order) {
    const text = name.trim()
    if (!text || used.has(text.toLowerCase())) {
      continue
    }
    used.add(text.toLowerCase())
    if ((counts.get(text.toLowerCase()) || 0) > 0) {
      names.push(text)
    }
  }
  const extra: string[] = []
  for (const item of items) {
    if (item.id === GLOBAL_SCOPE) {
      continue
    }
    const group = item.group.trim()
    if (!group || used.has(group.toLowerCase())) {
      continue
    }
    extra.push(group)
    used.add(group.toLowerCase())
  }
  names.push(...extra.sort((a, b) => a.localeCompare(b)))
  if (ungrouped > 0) {
    names.push(UNGROUPED)
  }
  return names
}

function inGroup(item: ThumbScope, active: string) {
  if (active === ALL_GROUP) {
    return true
  }
  const grouped = item.group.trim()
  if (active === UNGROUPED) {
    return !grouped
  }
  return grouped.toLowerCase() === active.toLowerCase()
}

function matchesSearch(item: ThumbScope, query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return true
  }
  return [item.name, item.group, ...(item.anyGroups ?? []).flat()].join(' ').toLowerCase().includes(needle)
}

function orderByIds(items: ThumbScope[], order?: string[]) {
  if (!order?.length) {
    return items
  }
  const rank = new Map(order.map((id, index) => [id, index]))
  return [...items].sort((a, b) => {
    const ai = rank.get(a.id)
    const bi = rank.get(b.id)
    if (ai == null && bi == null) {
      return 0
    }
    if (ai == null) {
      return 1
    }
    if (bi == null) {
      return -1
    }
    return ai - bi
  })
}
