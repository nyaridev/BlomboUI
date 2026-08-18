import { useEffect, useRef } from 'react'

export type ThumbItem = {
  key: string
  src: string
}

type ThumbStripProps = {
  items: ThumbItem[]
  index: number
  onSelect: (i: number) => void
}

function StripArrow({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="12" height="12" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d={dir === 'left' ? 'M11 4 6 9l5 5' : 'M7 4l5 5-5 5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ThumbStrip({ items, index, onSelect }: ThumbStripProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const scroller = scrollerRef.current
    const selected = scroller?.querySelector(`[data-thumb="${index}"]`)
    if (!scroller || !(selected instanceof HTMLElement)) {
      return
    }
    const left = selected.offsetLeft
    const right = left + selected.offsetWidth
    if (left < scroller.scrollLeft) {
      scroller.scrollLeft = left
    } else if (right > scroller.scrollLeft + scroller.clientWidth) {
      scroller.scrollLeft = right - scroller.clientWidth
    }
  }, [index])

  function step(dir: -1 | 1) {
    onSelect((index + dir + items.length) % items.length)
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className="flex h-16 w-7 shrink-0 items-center justify-center rounded border border-line bg-panel text-ink hover:bg-line"
        aria-label="Previous image"
        onClick={() => step(-1)}
      >
        <StripArrow dir="left" />
      </button>
      <div
        ref={scrollerRef}
        className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex w-max min-w-full justify-center gap-2 px-0.5 py-1">
          {items.map((item, i) => (
            <button
              key={item.key}
              type="button"
              data-thumb={i}
              className={[
                'h-16 w-16 shrink-0 rounded',
                i === index
                  ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg'
                  : 'opacity-40 hover:opacity-75',
              ].join(' ')}
              onClick={() => onSelect(i)}
            >
              <span className="block h-full w-full overflow-hidden rounded">
                <img src={item.src} alt="" className="h-full w-full object-cover" />
              </span>
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        className="flex h-16 w-7 shrink-0 items-center justify-center rounded border border-line bg-panel text-ink hover:bg-line"
        aria-label="Next image"
        onClick={() => step(1)}
      >
        <StripArrow dir="right" />
      </button>
    </div>
  )
}
