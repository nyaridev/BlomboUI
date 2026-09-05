import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { PaneSplitter } from '@/components/controls/resizable-panel/PaneSplitter.tsx'
import { IconButton } from '@/components/controls/button/IconButton.tsx'
import { GalleryTree } from '@/components/composites/gallery/GalleryTree.tsx'
import { otherKindLabel, remPx } from '@/components/composites/gallery/galleryUtils.ts'
import { TilePreview, TILE_GLOW } from '@/components/composites/models/TilePreview.tsx'
import type { GalleryNode } from '@/lib/gallery/tree.ts'
import { modelThumbSrc } from '@/lib/gallery/thumbView.ts'
import { storedLoraStrengthLabel } from '@/lib/prompt/loraTags.ts'
import type { ModelEntry, ModelLists, ThumbView } from '@/lib/api.ts'
import { useEffect, useState, type DragEvent, type MouseEvent, type RefObject } from 'react'

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
  const [windowRange, setWindowRange] = useState({ start: 0, end: tiles.length, padTop: 0, padBottom: 0 })

  useEffect(() => {
    const el = tilesRef.current
    if (!el) {
      setWindowRange({ start: 0, end: tiles.length, padTop: 0, padBottom: 0 })
      return
    }
    function update() {
      const node = tilesRef.current
      if (!node) {
        return
      }
      const rem = remPx()
      const gap = tileGapRem * rem
      const cellW = tileCellW * rem
      const cellH = tileCellH * rem
      const cols = Math.max(1, Math.floor((node.clientWidth + gap) / (cellW + gap)))
      const rowH = cellH + gap
      const rows = Math.max(1, Math.ceil(tiles.length / cols))
      const overscan = 4
      const first = Math.max(0, Math.floor(node.scrollTop / rowH) - overscan)
      const visible = Math.ceil(node.clientHeight / rowH) + overscan * 2
      const start = first * cols
      const end = Math.min(tiles.length, (first + visible) * cols)
      setWindowRange({
        start,
        end,
        padTop: first * rowH,
        padBottom: Math.max(0, (rows - first - visible) * rowH),
      })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    el.addEventListener('scroll', update, { passive: true })
    return () => {
      observer.disconnect()
      el.removeEventListener('scroll', update)
    }
  }, [tileCellH, tileCellW, tileGapRem, tiles.length, tilesRef])

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

  const tileStart = windowRange.end === 0 ? 0 : windowRange.start
  const tileEnd = windowRange.end === 0 ? tiles.length : windowRange.end
  const padTop = windowRange.end === 0 ? 0 : windowRange.padTop
  const padBottom = windowRange.end === 0 ? 0 : windowRange.padBottom

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
            className="h-full min-h-0 shrink-0 overflow-y-auto"
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
        className="h-full min-h-0 min-w-0 flex-1 overflow-y-auto py-2 pr-2"
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
              paddingTop: padTop,
              paddingBottom: padBottom,
            }}
          >
            {tiles.slice(tileStart, tileEnd).map((item) => {
              const selected = isOn(item.path) || focus === item.path
              const itemType = kindOf(item)
              const badge =
                itemType === 'loras' ? storedLoraStrengthLabel(item.strength, item.slider) : otherKindLabel(itemType)
              const preview = (
                <TilePreview
                  className="w-full"
                  src={modelThumbSrc(itemType, item, thumbView)}
                  rawSrc={modelThumbSrc(itemType, item, { ...thumbView, raw: true })}
                  mark="?"
                  label={labelOf(item)}
                  badge={badge || undefined}
                  selected={selected}
                  preventMediaDrag={fileOps}
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
                  className="min-w-0 p-1.5"
                >
                  <div className="group relative">
                    {content}
                    <div className="absolute top-2 right-2 z-20 flex gap-1 opacity-0 group-hover:opacity-100">
                      {itemType !== 'wildcards' && pathOf(item).toLowerCase().endsWith('.safetensors') ? (
                        <IconButton aria-label="Download from Civitai"
                          title="Download from Civitai"
                          disabled={filling === pathOf(item)}
                          onClick={() =>onDownload(pathOf(item), itemType)}
                        >
                          <AppIcon id="download" /></IconButton>
                      ) : null}
                      <IconButton aria-label="Model settings" title="Model settings" onClick={() =>onInfo(item)}>
                        <AppIcon id="info" /></IconButton>
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
