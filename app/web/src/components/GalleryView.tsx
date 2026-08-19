import { Chevron } from '@/components/Chevron.tsx'
import { buildGalleryTree, dirExists, type GalleryNode } from '@/lib/galleryTree.ts'
import { ModelInfoDialog } from '@/components/ModelInfoDialog.tsx'
import { PaneSplitter } from '@/components/PaneSplitter.tsx'
import { RefreshIcon } from '@/components/RefreshIcon.tsx'
import { SelectField } from '@/components/SelectField.tsx'
import { TilePreview } from '@/components/TilePreview.tsx'
import { modelLabel, modelPath, useModelsStore } from '@/stores/modelsStore.ts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { modelThumbUrl, type ModelEntry, type ModelLists } from '@/lib/api.ts'
import { useNavigate } from 'react-router-dom'

const TREE_REM = 18
const TREE_MIN_REM = 12

const SORTS = [
  { value: 'name', label: 'Name' },
  { value: 'added', label: 'Date Created' },
  { value: 'edited', label: 'Date Modified' },
  { value: 'path', label: 'Path' },
] as const

type SortKey = (typeof SORTS)[number]['value']
type SortDir = 'asc' | 'desc'

type GalleryViewProps = {
  kind: keyof ModelLists
  items: ModelEntry[]
  value?: string
  onSelect?: (id: string) => void
}

function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M7 6.4v3.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="7" cy="4.5" r="0.8" fill="currentColor" />
    </svg>
  )
}

function WrenchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M8.8 2.4 11.6 5.2 6.2 10.6 3.4 11.6 4.4 8.8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M7.4 3.8 10.2 6.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

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

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M1.5 3.5h4l1 1.5h6v6.5h-11z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function FileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M4 1.5h4.5L11.5 5v7.5H4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M8.5 1.5V5H11.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

function TreeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="5" y="1.5" width="4" height="3" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M7 4.5v2M4 8.5V6.5h6v2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="1.5" y="8.5" width="4" height="3" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="8.5" y="8.5" width="4" height="3" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function SortDirIcon({ dir }: { dir: SortDir }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M4 6.2 7 3.2 10 6.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={dir === 'asc' ? 1 : 0.35}
      />
      <path
        d="M4 7.8 7 10.8 10 7.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={dir === 'desc' ? 1 : 0.35}
      />
    </svg>
  )
}

function rowClass(on: boolean) {
  return [
    'flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
    on ? 'bg-line text-ink' : 'text-muted hover:bg-field hover:text-ink',
  ].join(' ')
}

function fileName(path: string) {
  return modelLabel(path.split(/[\\/]/).pop() || path)
}

function matchesQuery(item: ModelEntry, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) {
    return true
  }
  return item.path.toLowerCase().includes(q) || fileName(item.path).toLowerCase().includes(q)
}

function sortItems(items: ModelEntry[], key: SortKey, dir: SortDir) {
  const next = [...items]
  next.sort((a, b) => {
    if (key === 'added' || key === 'edited') {
      const delta = a[key] - b[key]
      if (delta !== 0) {
        return delta
      }
    }
    const av = key === 'path' ? a.path : modelLabel(a.path)
    const bv = key === 'path' ? b.path : modelLabel(b.path)
    return av.localeCompare(bv, undefined, { sensitivity: 'base' })
  })
  if (dir === 'desc') {
    next.reverse()
  }
  return next
}

export function GalleryView({ kind, items, value, onSelect }: GalleryViewProps) {
  const navigate = useNavigate()
  const rowRef = useRef<HTMLDivElement>(null)
  const [treeWidth, setTreeWidth] = useState(() => TREE_REM * 16)
  const [openDirs, setOpenDirs] = useState<Set<string>>(() => new Set())
  const [showTree, setShowTree] = useState(true)
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [infoItem, setInfoItem] = useState<ModelEntry | null>(null)
  const busy = useModelsStore((s) => s.busy)
  const refreshKind = useModelsStore((s) => s.refreshKind)
  const setThumb = useModelsStore((s) => s.setThumb)
  const paths = useMemo(() => items.map(modelPath).filter(Boolean), [items])
  const tree = useMemo(() => buildGalleryTree(paths), [paths])
  const tiles = useMemo(() => {
    return sortItems(
      items.filter((item) => modelPath(item) && matchesQuery(item, query)),
      sortKey,
      sortDir,
    )
  }, [items, query, sortKey, sortDir])

  useEffect(() => {
    setTreeWidth(TREE_REM * remPx())
  }, [])

  useEffect(() => {
    setOpenDirs((current) => {
      const next = new Set<string>()
      for (const path of current) {
        if (dirExists(paths, path)) {
          next.add(path)
        }
      }
      return next.size === current.size ? current : next
    })
  }, [paths])

  function clickDir(path: string) {
    const open = openDirs.has(path)
    const same = query.trim() === path
    if (!open) {
      setOpenDirs((current) => new Set(current).add(path))
      setQuery(path)
      return
    }
    if (same) {
      setOpenDirs((current) => {
        const next = new Set(current)
        next.delete(path)
        return next
      })
      setQuery('')
      return
    }
    setQuery(path)
  }

  function renderNode(node: GalleryNode) {
    if (node.kind === 'file') {
      const selected = Boolean(onSelect) && value === node.path
      const body = (
        <>
          <span className="w-4 shrink-0" />
          <span className="shrink-0 text-muted">
            <FileIcon />
          </span>
          <span className="truncate">{node.name}</span>
        </>
      )
      if (!onSelect) {
        return (
          <div key={node.path} title={node.path} className={rowClass(false)}>
            {body}
          </div>
        )
      }
      return (
        <button
          key={node.path}
          type="button"
          title={node.path}
          className={rowClass(selected)}
          onClick={() => onSelect(node.path)}
        >
          {body}
        </button>
      )
    }
    const open = openDirs.has(node.path)
    const on = query.trim() === node.path
    return (
      <div
        key={node.path}
        className={[
          'overflow-hidden rounded-md border',
          on ? 'border-accent' : 'border-line',
          open ? 'bg-field' : 'bg-transparent',
        ].join(' ')}
      >
        <button
          type="button"
          title={node.path}
          className={rowClass(on)}
          onClick={() => clickDir(node.path)}
        >
          <span className="flex h-4 w-4 shrink-0 items-center justify-center">
            <Chevron dir={open ? 'down' : 'right'} size={10} />
          </span>
          <span className="shrink-0">
            <FolderIcon />
          </span>
          <span className="truncate font-medium">{node.name}</span>
        </button>
        {open ? (
          <div className="flex flex-col gap-1 border-t border-line p-1.5 pl-3">
            {node.children.map((child) => renderNode(child))}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex h-8 shrink-0 items-stretch gap-1">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-muted">
            <SearchIcon />
          </span>
          <input
            className="h-full w-full rounded border border-line bg-field py-0 pr-2 pl-7 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
          />
        </div>
        <div className="flex h-full w-40 shrink-0 [&>div]:h-full [&>div]:w-full [&_.field-select]:h-full [&_.field-select]:py-0">
          <SelectField value={sortKey} onChange={(value) => setSortKey(value as SortKey)} options={[...SORTS]} />
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label={sortDir === 'asc' ? 'Ascending' : 'Descending'}
          title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
          onClick={() => setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))}
        >
          <SortDirIcon dir={sortDir} />
        </button>
        <button
          type="button"
          className={['icon-btn', showTree ? 'bg-line' : ''].join(' ')}
          aria-label={showTree ? 'Hide tree' : 'Show tree'}
          aria-pressed={showTree}
          title={showTree ? 'Hide tree' : 'Show tree'}
          onClick={() => setShowTree((on) => !on)}
        >
          <TreeIcon />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Refresh models"
          title="Refresh models (R)"
          disabled={busy}
          onClick={() => void refreshKind(kind)}
        >
          <RefreshIcon />
        </button>
      </div>
      <div ref={rowRef} className="flex min-h-0 flex-1 select-none">
        {showTree ? (
          <>
            <div className="flex min-h-0 shrink-0 flex-col gap-1.5 overflow-y-auto pr-1" style={{ width: treeWidth }}>
              {tree.map((node) => renderNode(node))}
            </div>
            <PaneSplitter
              value={treeWidth}
              onChange={setTreeWidth}
              onReset={() => setTreeWidth(TREE_REM * remPx())}
              min={TREE_MIN_REM * remPx()}
              containerRef={rowRef}
            />
          </>
        ) : null}
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-2">
          {tiles.length === 0 ? (
            <p className="text-xs text-muted">No items.</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
              {tiles.map((item) => {
                const selected = Boolean(onSelect) && value === item.path
                const preview = (
                  <TilePreview
                    className="w-full"
                    src={item.thumb ? modelThumbUrl(kind, item.path, item.thumb) : null}
                    mark="?"
                    label={fileName(item.path)}
                  />
                )
                return (
                  <div key={item.path} className="group relative min-w-0">
                    {onSelect ? (
                      <button
                        type="button"
                        title={item.path}
                        className={['w-full rounded', selected ? 'ring-2 ring-ink ring-offset-2 ring-offset-panel' : ''].join(' ')}
                        onClick={() => onSelect(item.path)}
                      >
                        {preview}
                      </button>
                    ) : (
                      <div title={item.path} className="w-full rounded">
                        {preview}
                      </div>
                    )}
                    <div className="absolute top-2 right-2 z-20 flex gap-1 opacity-0 group-hover:opacity-100">
                      {item.path.toLowerCase().endsWith('.safetensors') ? (
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label="File info"
                          title="File info"
                          onClick={() =>
                            navigate('/file-info', { state: { kind, path: item.path, thumb: item.thumb || 0 } })
                          }
                        >
                          <InfoIcon />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Model settings"
                        title="Model settings"
                        onClick={() => setInfoItem(item)}
                      >
                        <WrenchIcon />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      {infoItem ? (
        <ModelInfoDialog
          kind={kind}
          item={infoItem}
          onClose={() => setInfoItem(null)}
          onSaved={(thumb) => {
            setThumb(kind, infoItem.path, thumb)
            setInfoItem({ ...infoItem, thumb })
          }}
        />
      ) : null}
    </div>
  )
}
