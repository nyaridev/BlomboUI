import { SelectField } from '@/components/SelectField.tsx'
import { SliderField } from '@/components/SliderField.tsx'
import { GALLERY_SORTS, type GallerySortDir, type GallerySortKey } from '@/components/GalleryView.tsx'
import { SettingsCard } from './SettingsBlock.tsx'
import { useSettingsStore, type GalleryViewKind } from '@/stores/settingsStore.ts'

const DIRS = [
  { value: 'asc', label: 'Ascending' },
  { value: 'desc', label: 'Descending' },
] as const

const VIEWS: { kind: GalleryViewKind; title: string; terms: string }[] = [
  { kind: 'checkpoints', title: 'Base Model', terms: 'checkpoint' },
  { kind: 'loras', title: 'LoRA', terms: 'lora' },
  { kind: 'wildcards', title: 'Wildcards', terms: 'wildcard yaml' },
]

export const GALLERY_QUERY =
  'gallery view tiles sort name date created modified path ascending descending scale size base model lora wildcards tree folder parent unselect thumbnail global fallback scope'

export function GalleryPanel({ query = '' }: { query?: string }) {
  const gallerySortKey = useSettingsStore((s) => s.gallerySortKey)
  const gallerySortDir = useSettingsStore((s) => s.gallerySortDir)
  const galleryTileScale = useSettingsStore((s) => s.galleryTileScale)
  const galleryParentOnUnselect = useSettingsStore((s) => s.galleryParentOnUnselect)
  const galleryThumbFallback = useSettingsStore((s) => s.galleryThumbFallback)
  const setGallerySortKey = useSettingsStore((s) => s.setGallerySortKey)
  const setGallerySortDir = useSettingsStore((s) => s.setGallerySortDir)
  const setGalleryTileScale = useSettingsStore((s) => s.setGalleryTileScale)
  const setGalleryParentOnUnselect = useSettingsStore((s) => s.setGalleryParentOnUnselect)
  const setGalleryThumbFallback = useSettingsStore((s) => s.setGalleryThumbFallback)

  return (
    <div className="flex max-w-xl flex-col gap-3">
      {VIEWS.map((view) => (
        <SettingsCard key={view.kind} query={query} title={view.title} terms={`sort by order ${view.terms}`}>
          <div className="flex gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-xs text-muted">Sort by</span>
              <SelectField
                value={gallerySortKey[view.kind]}
                onChange={(value) => setGallerySortKey(view.kind, value as GallerySortKey)}
                options={[...GALLERY_SORTS]}
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-xs text-muted">Order</span>
              <SelectField
                value={gallerySortDir[view.kind]}
                onChange={(value) => setGallerySortDir(view.kind, value as GallerySortDir)}
                options={[...DIRS]}
              />
            </div>
          </div>
          <p className="text-xs text-muted">
            Used after launch or a UI reload. Changing sort in this gallery is only for that session.
          </p>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="check"
              checked={galleryThumbFallback[view.kind]}
              onChange={(event) => setGalleryThumbFallback(view.kind, event.target.checked)}
            />
            Use Global thumbnails in scoped view
          </label>
          <p className="text-xs text-muted">Off shows the default tile when this scope has no thumbnail.</p>
        </SettingsCard>
      ))}
      <SettingsCard query={query} title="Tiles" terms="tile scale size zoom">
        <SliderField value={galleryTileScale} onChange={setGalleryTileScale} min={0.5} max={2} step={0.1} />
        <p className="text-xs text-muted">1 is the current tile size.</p>
      </SettingsCard>
      <SettingsCard query={query} title="Tree" terms="folder directory parent unselect search">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="check"
            checked={galleryParentOnUnselect}
            onChange={(event) => setGalleryParentOnUnselect(event.target.checked)}
          />
          Select parent when unselecting a folder
        </label>
        <p className="text-xs text-muted">
          Clicking the selected folder in the gallery tree selects its parent. Off clears the search instead.
        </p>
      </SettingsCard>
    </div>
  )
}
