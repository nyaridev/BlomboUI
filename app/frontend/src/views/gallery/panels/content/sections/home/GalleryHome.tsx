import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import type { GalleryBrowseItem, GalleryHome as GalleryHomeData, GalleryItem, GalleryLibrary } from '@/lib/api/gallery.ts'
import type { ReactNode } from 'react'
import { GalleryCoverCard, labelOf } from '@/views/gallery/panels/content/sections/home/GalleryCoverCard.tsx'
import { HomeHero } from '@/views/gallery/panels/content/sections/home/HomeHero.tsx'

function ShelfTitle({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="flex items-center gap-1 text-left text-sm font-medium text-ink hover:text-accent"
      onClick={onClick}
    >
      {title}
      <AppIcon id="chevron-right" size={14} />
    </button>
  )
}

function Shelf({ title, onTitle, children }: { title: string; onTitle: () => void; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <ShelfTitle title={title} onClick={onTitle} />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">{children}</div>
    </section>
  )
}

export function GalleryHome({
  data,
  libraries,
  onOpen,
  onRecent,
  onTags,
  onModels,
  onLoras,
  onWildcards,
  onGalleries,
  onTag,
  onModel,
  onLora,
  onWildcard,
  onLibrary,
  onFavorite,
  onRemove,
  onFileInfo,
}: {
  data: GalleryHomeData
  libraries: GalleryLibrary[]
  onOpen: (item: GalleryItem) => void
  onRecent: () => void
  onTags: () => void
  onModels: () => void
  onLoras: () => void
  onWildcards: () => void
  onGalleries: () => void
  onTag: (tag: string) => void
  onModel: (name: string) => void
  onLora: (name: string) => void
  onWildcard: (name: string) => void
  onLibrary: (library: GalleryLibrary) => void
  onFavorite: (item: GalleryItem) => void
  onRemove: (item: GalleryItem) => void
  onFileInfo: (item: GalleryItem) => void
}) {
  return (
    <div className="flex flex-col gap-8">
      <HomeHero
        items={data.recent}
        onOpen={onOpen}
        onTitle={onRecent}
        onFavorite={onFavorite}
        onRemove={onRemove}
        onFileInfo={onFileInfo}
      />
      {data.tags.length ? (
        <Shelf title="Popular tags" onTitle={onTags}>
          {data.tags.map((item) => (
            <GalleryCoverCard
              key={item.tag}
              previews={item.previews}
              title={item.tag}
              subtitle={`${item.count} works`}
              onClick={() => onTag(item.tag)}
            />
          ))}
        </Shelf>
      ) : null}
      {data.checkpoints.length ? (
        <Shelf title="Recently used models" onTitle={onModels}>
          {data.checkpoints.map((item) => (
            <CoverBrowse key={item.name} item={item} onOpen={onModel} />
          ))}
        </Shelf>
      ) : null}
      {data.loras.length ? (
        <Shelf title="Recently used LoRAs" onTitle={onLoras}>
          {data.loras.map((item) => (
            <CoverBrowse key={item.name} item={item} onOpen={onLora} />
          ))}
        </Shelf>
      ) : null}
      {data.wildcards.length ? (
        <Shelf title="Recently used wildcards" onTitle={onWildcards}>
          {data.wildcards.map((item) => (
            <CoverBrowse key={item.name} item={item} onOpen={onWildcard} />
          ))}
        </Shelf>
      ) : null}
      {libraries.filter((item) => item.kind !== 'folder').length ? (
        <Shelf title="Galleries" onTitle={onGalleries}>
          {libraries
            .filter((item) => item.kind !== 'folder')
            .map((item) => (
            <GalleryCoverCard
              key={item.id}
              previews={item.previews}
              title={item.name}
              subtitle={item.query || 'Saved search'}
              onClick={() => onLibrary(item)}
            />
          ))}
        </Shelf>
      ) : null}
    </div>
  )
}

function CoverBrowse({ item, onOpen }: { item: GalleryBrowseItem; onOpen: (name: string) => void }) {
  return (
    <GalleryCoverCard
      previews={item.previews}
      title={labelOf(item.name)}
      subtitle={`${item.works} works`}
      onClick={() => onOpen(item.name)}
    />
  )
}
