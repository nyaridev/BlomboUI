import { GalleryBrowser } from '@/components/composites/gallery/GalleryBrowser.tsx'
import type { ModelEntry } from '@/lib/api.ts'

export function WildcardsPanel({
  items,
  selected,
  focus,
  onSelect,
}: {
  items: ModelEntry[]
  selected: string[]
  focus?: string
  onSelect: (path: string) => void
}) {
  return (
    <div className="flex-1">
      <GalleryBrowser kind="wildcards" items={items} selected={selected} focus={focus} onSelect={onSelect} />
    </div>
  )
}
