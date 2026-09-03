import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { GalleryLibraryTree } from '@/views/gallery/panels/content/sections/libraries/GalleryLibraryTree.tsx'
import type { GalleryLibrary } from '@/lib/api/gallery.ts'
import type { GallerySidebarId } from '@/views/gallery/panels/content/filters.ts'

function rowClass(on: boolean) {
  return [
    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
    on ? 'bg-line text-ink' : 'text-muted hover:bg-field hover:text-ink',
  ].join(' ')
}

export function GallerySidebar({
  nav,
  libraries,
  onNav,
  onAdd,
  onAddFolder,
  onEdit,
  onRemove,
  onDrop,
}: {
  nav: GallerySidebarId
  libraries: GalleryLibrary[]
  onNav: (id: GallerySidebarId) => void
  onAdd: (parentId: string | null) => void
  onAddFolder: (parentId: string | null) => void
  onEdit: (library: GalleryLibrary) => void
  onRemove: (library: GalleryLibrary) => void
  onDrop: (parentId: string | null, ids: string[]) => void
}) {
  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <div className="flex flex-col gap-0.5">
        <div className="px-2 py-0.5 text-[10px] font-medium tracking-[0.12em] text-muted uppercase">Browse</div>
        <button type="button" className={rowClass(nav === 'home')} onClick={() => onNav('home')}>
          <AppIcon id="house" size={14} />
          Home
        </button>
        <button type="button" className={rowClass(nav === 'checkpoints')} onClick={() => onNav('checkpoints')}>
          <AppIcon id="box" size={14} />
          Models
        </button>
        <button type="button" className={rowClass(nav === 'loras')} onClick={() => onNav('loras')}>
          <AppIcon id="layers" size={14} />
          LoRAs
        </button>
        <button type="button" className={rowClass(nav === 'wildcards')} onClick={() => onNav('wildcards')}>
          <AppIcon id="asterisk" size={14} />
          Wildcards
        </button>
        <button type="button" className={rowClass(nav === 'tags')} onClick={() => onNav('tags')}>
          <AppIcon id="tag" size={14} />
          Tags
        </button>
      </div>
      <div className="flex min-h-0 flex-col gap-0.5">
        <div className="px-2 py-0.5 text-[10px] font-medium tracking-[0.12em] text-muted uppercase">Galleries</div>
        <GalleryLibraryTree
          nav={nav}
          libraries={libraries}
          onNav={onNav}
          onAdd={onAdd}
          onAddFolder={onAddFolder}
          onEdit={onEdit}
          onRemove={onRemove}
          onDrop={onDrop}
        />
      </div>
    </nav>
  )
}
