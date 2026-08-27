import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { SegmentSwitch } from '@/components/controls/button/SegmentSwitch.tsx'
import { useEffect, useRef, useState } from 'react'
import { ORIENTATION, type GalleryOrientation } from '@/views/gallery/panels/content/filters.ts'

export function GallerySearchFilters({
  orientation,
  onChange,
}: {
  orientation: GalleryOrientation
  onChange: (value: GalleryOrientation) => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const active = orientation !== 'all'

  useEffect(() => {
    if (!open) {
      return
    }
    function onDoc(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        className={[
          'inline-flex h-toolbar items-center gap-1 rounded border px-2.5 text-sm',
          active ? 'border-accent bg-accent text-ink' : open ? 'border-accent bg-field text-ink' : 'border-line bg-field text-ink hover:text-ink',
        ].join(' ')}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Filters{active ? ' (1)' : ''}
        <AppIcon id={open ? 'chevron-up' : 'chevron-down'} size={12} />
      </button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+0.25rem)] z-40 w-[min(92vw,24rem)] rounded border border-line bg-panel p-3 shadow-[0_8px_24px_rgb(0_0_0_/_0.45)]">
          <p className="mb-1.5 text-xs text-muted">Resolution</p>
          <SegmentSwitch value={orientation} tone="blue" options={ORIENTATION} onChange={onChange} />
        </div>
      ) : null}
    </div>
  )
}
