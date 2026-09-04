import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { SelectField } from '@/components/controls/select/SelectField.tsx'
import { IconButton } from '@/components/controls/button/IconButton.tsx'
import type { GalleryBrowseItem } from '@/lib/api/gallery.ts'
import {
  galleryBrowseKey,
  useSettingsStore,
  type GalleryBrowseKind,
  type GalleryBrowseSort,
  type GallerySortDir,
} from '@/stores/settingsStore.ts'
import { GalleryCoverCard, labelOf } from '@/views/gallery/panels/content/sections/home/GalleryCoverCard.tsx'
import { useEffect, useState } from 'react'

const SORTS = [
  { value: 'recent', label: 'Recent' },
  { value: 'works', label: 'Most works' },
] as const

export function GalleryBrowse({
  kind,
  items,
  error,
  hasNext,
  loadingMore,
  onOpen,
  onMissing,
  onMore,
}: {
  kind: GalleryBrowseKind
  items: GalleryBrowseItem[]
  error: string | null
  hasNext: boolean
  loadingMore: boolean
  onOpen: (name: string) => void
  onMissing: (id: string) => void
  onMore: () => void
}) {
  const share = useSettingsStore((s) => s.galleryBrowseShare)
  const key = galleryBrowseKey(kind, share)
  const sort = useSettingsStore((s) => s.galleryBrowseSort[key] ?? (kind === 'tags' && !share ? 'works' : 'recent'))
  const dir = useSettingsStore((s) => s.galleryBrowseDir[key] ?? 'desc')
  const setSort = useSettingsStore((s) => s.setGalleryBrowseSort)
  const setDir = useSettingsStore((s) => s.setGalleryBrowseDir)
  const setShare = useSettingsStore((s) => s.setGalleryBrowseShare)
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!scroller || !sentinel || !hasNext || loadingMore) {
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          onMore()
        }
      },
      { root: scroller, rootMargin: '200px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasNext, loadingMore, onMore, scroller, sentinel])

  return (
    <div ref={setScroller} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <div className="flex h-toolbar shrink-0 items-stretch gap-cluster">
        <SelectField
          value={sort}
          onChange={(value) => setSort(kind, value as GalleryBrowseSort)}
          options={[...SORTS]}
        />
        <IconButton aria-label={dir === 'desc' ? 'Descending' : 'Ascending'}
          title={dir === 'desc' ? 'Descending' : 'Ascending'}
          onClick={() =>setDir(kind, (dir === 'desc' ? 'asc' : 'desc') as GallerySortDir)}
        >
          <AppIcon id={dir === 'desc' ? 'arrow-down' : 'arrow-up'} /></IconButton>
        <IconButton
          on={share}
          aria-label={share ? 'Sharing filters across Models, LoRAs, Wildcards, and Tags' : 'Share filters across Models, LoRAs, Wildcards, and Tags'}
          aria-pressed={share}
          title={share ? 'Sharing filters across Models, LoRAs, Wildcards, and Tags' : 'Share filters across Models, LoRAs, Wildcards, and Tags'}
          onClick={() => setShare(!share)}
        >
          <AppIcon id="globe" />
        </IconButton>
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
              onMissing={onMissing}
            />
          ))}
        </div>
      )}
      {hasNext ? (
        <div ref={setSentinel} className="flex h-12 w-full shrink-0 items-center justify-center" aria-hidden={!loadingMore}>
          {loadingMore ? (
            <span
              className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-ink"
              role="status"
              aria-label="Loading more"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
