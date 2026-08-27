import { GalleryBrowser } from '@/components/composites/gallery/GalleryBrowser.tsx'
import type { ModelEntry, ModelLists } from '@/lib/api.ts'

export function BaseModelPanel({
  kind,
  items,
  itemKind,
  value,
  onSelect,
}: {
  kind: keyof ModelLists
  items: ModelEntry[]
  itemKind?: (item: ModelEntry) => keyof ModelLists
  value: string
  onSelect: (path: string) => void
}) {
  return (
    <div className="flex-1">
      <GalleryBrowser kind={kind} items={items} itemKind={itemKind} value={value} onSelect={onSelect} />
    </div>
  )
}
