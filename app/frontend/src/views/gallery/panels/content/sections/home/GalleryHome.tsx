import type { GalleryBrowseItem, GalleryHome as GalleryHomeData, GalleryItem, GalleryLibrary } from '@/lib/api/gallery.ts'
import type { ReactNode } from 'react'
import { GalleryCoverCard, labelOf } from '@/views/gallery/panels/content/sections/home/GalleryCoverCard.tsx'
import { HomeHero } from '@/views/gallery/panels/content/sections/home/HomeHero.tsx'

function Shelf({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-ink">{title}</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">{children}</div>
    </section>
  )
}

export function GalleryHome({
  data,
  libraries,
  onOpen,
  onTag,
  onModel,
  onLora,
  onWildcard,
  onLibrary,
}: {
  data: GalleryHomeData
  libraries: GalleryLibrary[]
  onOpen: (item: GalleryItem) => void
  onTag: (tag: string) => void
  onModel: (name: string) => void
  onLora: (name: string) => void
  onWildcard: (name: string) => void
  onLibrary: (library: GalleryLibrary) => void
}) {
  return (
    <div className="flex flex-col gap-8">
      <HomeHero items={data.recent} onOpen={onOpen} />
      {data.tags.length ? (
        <Shelf title="Popular tags">
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
        <Shelf title="Recently used models">
          {data.checkpoints.map((item) => (
            <CoverBrowse key={item.name} item={item} onOpen={onModel} />
          ))}
        </Shelf>
      ) : null}
      {data.loras.length ? (
        <Shelf title="Recently used LoRAs">
          {data.loras.map((item) => (
            <CoverBrowse key={item.name} item={item} onOpen={onLora} />
          ))}
        </Shelf>
      ) : null}
      {data.wildcards.length ? (
        <Shelf title="Recently used wildcards">
          {data.wildcards.map((item) => (
            <CoverBrowse key={item.name} item={item} onOpen={onWildcard} />
          ))}
        </Shelf>
      ) : null}
      {libraries.filter((item) => item.kind !== 'folder').length ? (
        <Shelf title="Galleries">
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
