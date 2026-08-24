import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { PaneSplitter } from '@/components/chrome/PaneSplitter.tsx'
import { GalleryTree } from '@/components/gallery/GalleryTree.tsx'
import { TilePreview, TILE_GLOW } from '@/components/models/TilePreview.tsx'
import type { GalleryNode } from '@/lib/gallery/tree.ts'
import { modelThumbSrc } from '@/lib/gallery/thumbView.ts'
import { storedLoraStrengthLabel } from '@/lib/prompt/loraTags.ts'
import type { ModelEntry, ModelLists, ThumbView } from '@/lib/api.ts'
import type { DragEvent, MouseEvent, RefObject } from 'react'

export function GalleryTiles({
  rowRef,
  treeRef,
  tilesRef,
  fill,
  bodyRem,
  showTree,
  treeWidth,
  minTreeWidth,
  onTreeWidth,
  onResetTreeWidth,
  tree,
  query,
  openDirs,
  extraNames,
  fileOps,
  dragIdent,
  onDragIdent,
  onTreeScroll,
  onTileScroll,
  byTree,
  items,
  isOn,
  onClickDir,
  onClickFile,
  onMove,
  onRename,
  onReveal,
  onRemove,
  onAdd,
  onOpenManager,
  tiles,
  tileCellW,
  tileCellH,
  tileGapRem,
  kindOf,
  pathOf,
  labelOf,
  thumbView,
  focus,
  onSelect,
  onTileMenu,
  filling,
  onDownload,
  onInfo,
}: {
  rowRef: RefObject<HTMLDivElement | null>
  treeRef: RefObject<HTMLDivElement | null>
  tilesRef: RefObject<HTMLDivElement | null>
  fill: boolean
  bodyRem: number
  showTree: boolean
  treeWidth: number
  minTreeWidth: number
  onTreeWidth: (value: number) => void
  onResetTreeWidth: () => void
  tree: GalleryNode[]
  query: string
  openDirs: Set<string>
  extraNames: string[]
  fileOps: boolean
  dragIdent: string | null
  onDragIdent: (ident: string | null) => void
  onTreeScroll: (value: number) => void
  onTileScroll: (value: number) => void
  byTree: Map<string, ModelEntry>
  items: ModelEntry[]
  isOn: (path: string) => boolean
  onClickDir: (path: string) => void
  onClickFile: (path: string) => void
  onMove: (path: string, folder: string) => void
  onRename: (path: string, name: string) => void
  onReveal: (path: string) => void
  onRemove: (path: string) => void
  onAdd: (folder: string) => void
  onOpenManager?: (path: string, kind: 'dir' | 'file') => void
  tiles: ModelEntry[]
  tileCellW: number
  tileCellH: number
  tileGapRem: number
  kindOf: (item: ModelEntry) => keyof ModelLists
  pathOf: (item: ModelEntry) => string
  labelOf: (item: ModelEntry) => string
  thumbView: ThumbView
  focus?: string
  onSelect?: (path: string) => void
  onTileMenu: (event: MouseEvent, item: ModelEntry) => void
  filling: string | null
  onDownload: (path: string, kind: keyof ModelLists) => void
  onInfo: (item: ModelEntry) => void
}) {
  function startDrag(event: DragEvent, item: ModelEntry) {
    if (!fileOps) {
      event.preventDefault()
      return
    }
    event.dataTransfer.effectAllowed = 'move'
    const path = pathOf(item)
    event.dataTransfer.setData('text/plain', path)
    onDragIdent(path)
  }

  return (
    <div
      ref={rowRef}
      className={fill ? 'flex min-h-0 flex-1 overflow-hidden select-none' : 'flex min-h-0 overflow-hidden select-none'}
      style={fill ? undefined : { height: `${bodyRem}rem` }}
    >
      {showTree ? (
        <>
          <div
            ref={treeRef}
            className="h-full min-h-0 shrink-0 overflow-y-auto pr-1"
            style={{ width: treeWidth }}
            onScroll={(event) => {
              onTreeScroll(event.currentTarget.scrollTop)
            }}
          >
            <GalleryTree
              roots={tree}
              query={query}
              openDirs={openDirs}
              extraNames={extraNames}
              fileOps={fileOps}
              externalDrag={dragIdent}
              fileOn={(path) => query.trim() === path || items.some((item) => isOn(item.path) && (item.source || item.path.split('#')[0]) === path)}
              fileLabel={(path, name) => {
                const item = byTree.get(path)
                return item ? labelOf(item) : name
              }}
              onClickDir={onClickDir}
              onClickFile={onClickFile}
              onMove={onMove}
              onRename={onRename}
              onReveal={onReveal}
              onRemove={onRemove}
              onAdd={onAdd}
              onOpenManager={onOpenManager}
            />
          </div>
          <PaneSplitter
            value={treeWidth}
            onChange={onTreeWidth}
            onReset={onResetTreeWidth}
            min={minTreeWidth}
            containerRef={rowRef}
          />
        </>
      ) : null}
      <div
        ref={tilesRef}
        className="h-full min-h-0 min-w-0 flex-1 overflow-y-auto p-2"
        onScroll={(event) => {
          onTileScroll(event.currentTarget.scrollTop)
        }}
      >
        {tiles.length === 0 ? (
          <p className="text-xs text-muted">No items.</p>
        ) : (
          <div
            className="grid"
            style={{
              gap: `${tileGapRem}rem`,
              gridAutoRows: `${tileCellH}rem`,
              gridTemplateColumns: `repeat(auto-fill, minmax(${tileCellW}rem, ${tileCellW}rem))`,
            }}
          >
            {tiles.map((item) => {
              const selected = isOn(item.path) || focus === item.path
              const itemType = kindOf(item)
              const strength = itemType === 'loras' ? storedLoraStrengthLabel(item.strength, item.slider) : ''
              const preview = (
                <TilePreview
                  className="w-full"
                  src={modelThumbSrc(itemType, item, thumbView)}
                  mark="?"
                  label={labelOf(item)}
                  badge={strength || undefined}
                  selected={selected}
                />
              )
              const content = onSelect ? (
                <button
                  type="button"
                  title={item.path}
                  draggable={fileOps}
                  className={['block w-full rounded', selected ? TILE_GLOW : ''].join(' ')}
                  onClick={() => onSelect(item.path)}
                  onContextMenu={(event) => onTileMenu(event, item)}
                  onDragStart={(event) => startDrag(event, item)}
                  onDragEnd={() => onDragIdent(null)}
                >
                  {preview}
                </button>
              ) : (
                <div
                  title={item.path}
                  draggable={fileOps}
                  className="block w-full overflow-hidden rounded"
                  onContextMenu={(event) => onTileMenu(event, item)}
                  onDragStart={(event) => startDrag(event, item)}
                  onDragEnd={() => onDragIdent(null)}
                >
                  {preview}
                </div>
              )
              return (
                <div
                  key={`${itemType}:${item.path}`}
                  className="min-w-0 p-1.5 [content-visibility:auto]"
                  style={{ containIntrinsicSize: `${tileCellW}rem ${tileCellH}rem` }}
                >
                  <div className="group relative">
                    {content}
                    <div className="absolute top-2 right-2 z-20 flex gap-1 opacity-0 group-hover:opacity-100">
                      {itemType !== 'wildcards' && pathOf(item).toLowerCase().endsWith('.safetensors') ? (
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label="Download from Civitai"
                          title="Download from Civitai"
                          disabled={filling === pathOf(item)}
                          onClick={() => onDownload(pathOf(item), itemType)}
                        >
                          <AppIcon id="download" />
                        </button>
                      ) : null}
                      <button type="button" className="icon-btn" aria-label="Model settings" title="Model settings" onClick={() => onInfo(item)}>
                        <AppIcon id="info" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
