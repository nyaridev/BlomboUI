import { GalleryBrowser } from '@/components/composites/gallery/GalleryBrowser.tsx'
import type { ModelEntry, ModelLists } from '@/lib/api.ts'

export function OtherPanel({
  items,
  itemKind,
  selected,
  onSelect,
}: {
  items: ModelEntry[]
  itemKind: (item: ModelEntry) => keyof ModelLists
  selected: string[]
  onSelect: (path: string) => void
}) {
  return (
    <div className="flex-1">
      <GalleryBrowser kind="vae" chromeKey="other" items={items} itemKind={itemKind} selected={selected} onSelect={onSelect} />
    </div>
  )
}
