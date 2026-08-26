import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { SelectField } from '@/components/primitives/SelectField.tsx'
import type { GalleryBrowseItem } from '@/lib/api/gallery.ts'
import {
  galleryBrowseKey,
  useSettingsStore,
  type GalleryBrowseKind,
  type GalleryBrowseSort,
  type GallerySortDir,
} from '@/stores/settingsStore.ts'
import { GalleryCoverCard, labelOf } from './GalleryCoverCard.tsx'

const SORTS = [
  { value: 'recent', label: 'Recent' },
  { value: 'works', label: 'Most works' },
] as const

export function GalleryBrowse({
  kind,
  items,
  error,
  onOpen,
}: {
  kind: GalleryBrowseKind
  items: GalleryBrowseItem[]
  error: string | null
  onOpen: (name: string) => void
}) {
  const share = useSettingsStore((s) => s.galleryBrowseShare)
  const key = galleryBrowseKey(kind, share)
  const sort = useSettingsStore((s) => s.galleryBrowseSort[key] ?? 'recent')
  const dir = useSettingsStore((s) => s.galleryBrowseDir[key] ?? 'desc')
  const setSort = useSettingsStore((s) => s.setGalleryBrowseSort)
  const setDir = useSettingsStore((s) => s.setGalleryBrowseDir)
  const setShare = useSettingsStore((s) => s.setGalleryBrowseShare)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-8 items-stretch gap-1">
        <SelectField
          value={sort}
          onChange={(value) => setSort(kind, value as GalleryBrowseSort)}
          options={[...SORTS]}
        />
        <button
          type="button"
          className="icon-btn"
          aria-label={dir === 'desc' ? 'Descending' : 'Ascending'}
          title={dir === 'desc' ? 'Descending' : 'Ascending'}
          onClick={() => setDir(kind, (dir === 'desc' ? 'asc' : 'desc') as GallerySortDir)}
        >
          <AppIcon id={dir === 'desc' ? 'arrow-down' : 'arrow-up'} />
        </button>
        <button
          type="button"
          className={['icon-btn', share ? 'on' : ''].join(' ')}
          aria-label={share ? 'Sharing filters across Models, LoRAs, and Wildcards' : 'Share filters across Models, LoRAs, and Wildcards'}
          aria-pressed={share}
          title={share ? 'Sharing filters across Models, LoRAs, and Wildcards' : 'Share filters across Models, LoRAs, and Wildcards'}
          onClick={() => setShare(!share)}
        >
          <AppIcon id="globe" />
        </button>
      </div>
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      {items.length === 0 && !error ? (
        <p className="text-sm text-muted">No generations with this type yet.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
          {items.map((item) => (
            <GalleryCoverCard
              key={item.name}
              previews={item.previews}
              title={labelOf(item.name)}
              subtitle={`${item.works} works`}
              onClick={() => onOpen(item.name)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
