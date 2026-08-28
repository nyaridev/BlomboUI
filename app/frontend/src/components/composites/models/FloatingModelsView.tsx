import { GalleryBrowser } from '@/components/composites/gallery/GalleryBrowser.tsx'
import { useModelsStore } from '@/stores/modelsStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import type { ModelEntry, ModelLists } from '@/lib/api.ts'
import { useEffect, useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

type FloatingModelsViewProps = {
  kind: keyof ModelLists
  items?: ModelEntry[]
  itemKind?: (item: ModelEntry) => keyof ModelLists
  value?: string
  selected?: string[]
  onSelect: (path: string) => void
  onClose: () => void
  anchor: DOMRect
  chromeKey?: string
  dismissOutside?: boolean
  closeOnSelect?: boolean
  autoCheckpoint?: string
}

export function FloatingModelsView({
  kind,
  items: itemsProp,
  itemKind,
  value = '',
  selected,
  onSelect,
  onClose,
  anchor,
  chromeKey,
  dismissOutside = true,
  closeOnSelect = true,
  autoCheckpoint,
}: FloatingModelsViewProps) {
  const stored = useModelsStore((s) => s[kind])
  const items = itemsProp ?? stored
  const load = useModelsStore((s) => s.load)
  const galleryTileScale = useSettingsStore((s) => s.galleryTileScale)
  const panelRef = useRef<HTMLDivElement>(null)
  const pos = placePanel(anchor)

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return
      }
      event.stopImmediatePropagation()
      event.preventDefault()
      onClose()
    }
    function onPointer(event: PointerEvent) {
      if (!dismissOutside) {
        return
      }
      const node = event.target as Node | null
      if (panelRef.current?.contains(node)) {
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
  }, [dismissOutside, onClose])

  return createPortal(
    <div
      ref={panelRef}
      data-overlay=""
      data-models-picker=""
      className="fixed z-[80] flex flex-col overflow-hidden rounded-md border border-line bg-panel p-2 shadow-[0_8px_24px_rgb(0_0_0_/_0.45)]"
      style={pos}
    >
      <GalleryBrowser
        kind={kind}
        items={items}
        itemKind={itemKind}
        value={value}
        selected={selected}
        onSelect={(path) => {
          onSelect(path)
          if (closeOnSelect) {
            onClose()
          }
        }}
        chromeKey={chromeKey || `pick-${kind}`}
        fill
        fileOps={false}
        tileScale={galleryTileScale * 0.5}
        autoCheckpoint={autoCheckpoint}
      />
    </div>,
    document.body,
  )
}

function placePanel(anchor: DOMRect): CSSProperties {
  const width = Math.min(window.innerWidth - 16, 56 * 16)
  const height = Math.min(window.innerHeight - 24, 36 * 16)
  const gap = 4
  let top = anchor.bottom + gap
  let left = anchor.left
  if (top + height > window.innerHeight - 8) {
    top = Math.max(8, anchor.top - gap - height)
  }
  if (left + width > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - 8 - width)
  }
  return { top, left, width, height }
}
