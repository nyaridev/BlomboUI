import { AppIcon } from '@/components/AppIcon.tsx'
import type { CivitaiTab } from '@/lib/civitaiVersion.ts'

function tabClass(active: boolean) {
  return [
    'inline-flex max-w-48 shrink-0 items-center gap-1 rounded border px-2 py-1 text-xs',
    active ? 'border-accent bg-accent text-ink' : 'border-line bg-field text-muted hover:text-ink',
  ].join(' ')
}

export function CivitaiNavBar({
  tabs,
  activeId,
  onHome,
  onSelect,
  onClose,
  onClear,
}: {
  tabs: CivitaiTab[]
  activeId: number | null
  onHome: () => void
  onSelect: (id: number) => void
  onClose: (id: number) => void
  onClear: () => void
}) {
  return (
    <div className="flex min-w-0 shrink-0 items-stretch gap-2">
      <button
        type="button"
        className={tabClass(activeId === null)}
        onClick={onHome}
      >
        <AppIcon id="house" size={12} />
        Home
      </button>
      <div className="flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={tabClass(activeId === tab.id)}
            onMouseDown={(event) => {
              if (event.button === 1) {
                event.preventDefault()
                event.stopPropagation()
                onClose(tab.id)
              }
            }}
            onAuxClick={(event) => {
              if (event.button === 1) {
                event.preventDefault()
                event.stopPropagation()
              }
            }}
          >
            <button
              type="button"
              className="min-w-0 truncate"
              title={tab.name}
              onClick={() => onSelect(tab.id)}
            >
              {tab.name}
            </button>
            <button
              type="button"
              className="shrink-0 rounded p-0.5 text-muted hover:bg-line hover:text-ink"
              aria-label={`Close ${tab.name}`}
              onClick={(event) => {
                event.stopPropagation()
                onClose(tab.id)
              }}
            >
              <AppIcon id="x" size={10} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="inline-flex shrink-0 items-center rounded border border-red bg-red/20 px-2 py-1 text-xs text-red-bright hover:bg-red/30 disabled:opacity-40"
        disabled={!tabs.length}
        onClick={onClear}
      >
        Clear
      </button>
    </div>
  )
}
