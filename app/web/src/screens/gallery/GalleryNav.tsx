import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { ContextMenu, ContextMenuItem } from '@/components/chrome/ContextMenu.tsx'
import type { GalleryLibrary } from '@/lib/api/gallery.ts'
import { useState } from 'react'
import type { GalleryNavId } from './filters.ts'

function rowClass(on: boolean) {
  return [
    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
    on ? 'bg-line text-ink' : 'text-muted hover:bg-field hover:text-ink',
  ].join(' ')
}

export function GalleryNav({
  nav,
  libraries,
  onNav,
  onAdd,
  onEdit,
  onRemove,
}: {
  nav: GalleryNavId
  libraries: GalleryLibrary[]
  onNav: (id: GalleryNavId) => void
  onAdd: () => void
  onEdit: (library: GalleryLibrary) => void
  onRemove: (library: GalleryLibrary) => void
}) {
  const [menu, setMenu] = useState<{ x: number; y: number; library: GalleryLibrary } | null>(null)

  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
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
      </div>
      <div className="flex min-h-0 flex-col gap-0.5">
        <div className="px-2 py-0.5 text-[10px] font-medium tracking-[0.12em] text-muted uppercase">Galleries</div>
        <button type="button" className={rowClass(nav === 'libraries')} onClick={() => onNav('libraries')}>
          <AppIcon id="images" size={14} />
          All
        </button>
        {libraries.map((library) => (
          <button
            key={library.id}
            type="button"
            className={rowClass(nav === `library:${library.id}`)}
            onClick={() => onNav(`library:${library.id}`)}
            onContextMenu={(event) => {
              event.preventDefault()
              setMenu({ x: event.clientX, y: event.clientY, library })
            }}
          >
            <AppIcon id="folder" size={14} />
            <span className="min-w-0 truncate">{library.name}</span>
          </button>
        ))}
        <button type="button" className={rowClass(false)} onClick={onAdd}>
          <AppIcon id="plus" size={14} />
          New gallery
        </button>
      </div>
      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <ContextMenuItem
            label="Edit"
            icon="pencil"
            onClick={() => {
              onEdit(menu.library)
              setMenu(null)
            }}
          />
          <ContextMenuItem
            label="Remove"
            danger
            onClick={() => {
              onRemove(menu.library)
              setMenu(null)
            }}
          />
        </ContextMenu>
      ) : null}
    </nav>
  )
}
