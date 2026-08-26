import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { ChipSelect } from '@/components/primitives/ChipSelect.tsx'
import { SelectField } from '@/components/primitives/SelectField.tsx'
import { ThumbnailScopePicker } from '@/components/models/ThumbnailScopePicker.tsx'
import type { ChipSection } from '@/components/primitives/ChipSelect.tsx'
import type { GalleryViewKind } from '@/stores/settingsStore.ts'

export const GALLERY_SORTS = [
  { value: 'name', label: 'Name' },
  { value: 'added', label: 'Date Created' },
  { value: 'edited', label: 'Date Modified' },
  { value: 'path', label: 'Path' },
] as const

export type GallerySortKey = (typeof GALLERY_SORTS)[number]['value']
export type GallerySortDir = 'asc' | 'desc'

function GlobeBtn({
  on,
  onToggle,
  shareOn,
  shareOff,
}: {
  on: boolean
  onToggle: () => void
  shareOn: string
  shareOff: string
}) {
  return (
    <button
      type="button"
      className={['icon-btn', on ? 'on' : ''].join(' ')}
      aria-label={on ? shareOn : shareOff}
      aria-pressed={on}
      title={on ? shareOn : shareOff}
      onClick={onToggle}
    >
      <AppIcon id="globe" />
    </button>
  )
}

export function GalleryToolbar({
  sortKind,
  scopeKey,
  query,
  onQuery,
  typeOptions,
  typeFilter,
  onTypes,
  sortKey,
  sortDir,
  onSortKey,
  onSortDir,
  showTree,
  onShowTree,
  pinSelected,
  onPinSelected,
  hasSelection,
  busy,
  onRefresh,
  chipLabel,
  scopeGlobal,
  onScopeGlobal,
  filterGlobal,
  onFilterGlobal,
  shareLabel,
  autoType,
  onAutoType,
}: {
  sortKind: GalleryViewKind
  scopeKey: string
  query: string
  onQuery: (value: string) => void
  typeOptions: ChipSection[]
  typeFilter: string[]
  onTypes: (value: string[]) => void
  sortKey: GallerySortKey
  sortDir: GallerySortDir
  onSortKey: (value: GallerySortKey) => void
  onSortDir: () => void
  showTree: boolean
  onShowTree: () => void
  pinSelected: boolean
  onPinSelected: () => void
  hasSelection: boolean
  busy: boolean
  onRefresh: () => void
  chipLabel?: (item: string) => string
  scopeGlobal: boolean
  onScopeGlobal: () => void
  filterGlobal: boolean
  onFilterGlobal: () => void
  shareLabel: string
  autoType?: boolean
  onAutoType?: () => void
}) {
  return (
    <>
      <div className="flex h-8 shrink-0 items-stretch gap-1">
        <ThumbnailScopePicker fallbackKind={sortKind} scopeKey={scopeKey} />
        <GlobeBtn
          on={scopeGlobal}
          onToggle={onScopeGlobal}
          shareOn={`Sharing scopes across ${shareLabel}`}
          shareOff={`Share scopes across ${shareLabel}`}
        />
      </div>
      <div className="flex h-8 shrink-0 items-stretch gap-1">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-muted">
            <AppIcon id="search" size={12} />
          </span>
          <input
            className="h-full w-full rounded border border-line bg-field py-0 pr-2 pl-7 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search…"
          />
        </div>
        {onAutoType ? (
          <button
            type="button"
            className={['icon-btn', autoType ? 'on' : ''].join(' ')}
            aria-label={autoType ? 'Auto types on' : 'Auto types'}
            aria-pressed={autoType}
            title={
              autoType
                ? 'Auto on: types follow the loaded checkpoint'
                : 'Auto: set types from the loaded checkpoint'
            }
            onClick={onAutoType}
          >
            <AppIcon id="tags" />
          </button>
        ) : null}
        <div className="h-full w-44 shrink-0">
          <ChipSelect compact options={typeOptions} value={typeFilter} onChange={onTypes} placeholder="Types…" chipLabel={chipLabel} />
        </div>
        <div className="flex h-full w-40 shrink-0 [&>div]:h-full [&>div]:w-full [&_.field-select]:h-full [&_.field-select]:py-0">
          <SelectField value={sortKey} onChange={(value) => onSortKey(value as GallerySortKey)} options={[...GALLERY_SORTS]} />
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label={sortDir === 'asc' ? 'Ascending' : 'Descending'}
          title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
          onClick={onSortDir}
        >
          <AppIcon id={sortDir === 'asc' ? 'arrow-up-narrow-wide' : 'arrow-down-narrow-wide'} />
        </button>
        <button
          type="button"
          className={['icon-btn', showTree ? 'bg-line' : ''].join(' ')}
          aria-label={showTree ? 'Hide tree' : 'Show tree'}
          aria-pressed={showTree}
          title={showTree ? 'Hide tree' : 'Show tree'}
          onClick={onShowTree}
        >
          <AppIcon id="folder-tree" />
        </button>
        {hasSelection ? (
          <button
            type="button"
            className={['icon-btn', pinSelected ? 'bg-line' : ''].join(' ')}
            aria-label={pinSelected ? 'Unpin selected from top' : 'Pin selected to top'}
            aria-pressed={pinSelected}
            title={pinSelected ? 'Unpin selected from top' : 'Pin selected to top'}
            onClick={onPinSelected}
          >
            <AppIcon id={pinSelected ? 'eye' : 'eye-off'} />
          </button>
        ) : null}
        <button type="button" className="icon-btn" aria-label="Refresh models" title="Refresh models (R)" disabled={busy} onClick={onRefresh}>
          <AppIcon id="refresh-cw" />
        </button>
        <GlobeBtn
          on={filterGlobal}
          onToggle={onFilterGlobal}
          shareOn={`Sharing filters across ${shareLabel}`}
          shareOff={`Share filters across ${shareLabel}`}
        />
      </div>
    </>
  )
}
