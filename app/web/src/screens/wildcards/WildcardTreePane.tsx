import { PaneSplitter } from '@/components/chrome/PaneSplitter.tsx'
import type { WildcardTreeNode } from '@/lib/api.ts'
import { WildcardTree } from './WildcardTree.tsx'
import type { RefObject } from 'react'

export function WildcardTreePane({
  rowRef,
  treeWidth,
  shown,
  filePath,
  folderPath,
  openDirs,
  onToggleDir,
  onSelectFile,
  onSelectFolder,
  onMove,
  onRename,
  onReveal,
  onRemove,
  onAdd,
  onTreeWidth,
  onResetTreeWidth,
}: {
  rowRef: RefObject<HTMLDivElement | null>
  treeWidth: number
  shown: WildcardTreeNode[]
  filePath: string | null
  folderPath: string | null
  openDirs: Set<string>
  onToggleDir: (path: string) => void
  onSelectFile: (path: string) => void
  onSelectFolder: (path: string) => void
  onMove: (path: string, folder: string) => void
  onRename: (path: string, name: string) => void
  onReveal: (path: string) => void
  onRemove: (path: string) => void
  onAdd: (folder: string) => void
  onTreeWidth: (value: number) => void
  onResetTreeWidth: () => void
}) {
  return (
    <>
      <aside className="flex min-h-0 shrink-0 flex-col pr-3" style={{ width: treeWidth }}>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <WildcardTree
            roots={shown}
            filePath={filePath}
            folderPath={folderPath}
            openDirs={openDirs}
            onToggleDir={onToggleDir}
            onSelectFile={onSelectFile}
            onSelectFolder={onSelectFolder}
            onMove={onMove}
            onRename={onRename}
            onReveal={onReveal}
            onRemove={onRemove}
            onAdd={onAdd}
          />
        </div>
      </aside>
      <PaneSplitter
        value={treeWidth}
        onChange={onTreeWidth}
        onReset={onResetTreeWidth}
        min={10 * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16)}
        containerRef={rowRef}
      />
    </>
  )
}
