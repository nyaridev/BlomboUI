import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { setCivitaiTabFlashHandler } from '@/lib/civitai/openTab.ts'
import type { CivitaiTab } from '@/lib/civitai/version.ts'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const GLOW_MS = 1000

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
  const flashRef = useRef<HTMLDivElement>(null)
  const [flash, setFlash] = useState<{ id: number; n: number } | null>(null)
  const nRef = useRef(0)

  useEffect(() => {
    setCivitaiTabFlashHandler((id) => {
      nRef.current += 1
      setFlash({ id, n: nRef.current })
    })
    return () => setCivitaiTabFlashHandler(null)
  }, [])

  useEffect(() => {
    if (!flash) {
      return
    }
    const timer = window.setTimeout(() => {
      setFlash((current) => (current?.n === flash.n ? null : current))
    }, GLOW_MS)
    return () => window.clearTimeout(timer)
  }, [flash])

  useLayoutEffect(() => {
    const el = flashRef.current
    if (!el || !flash) {
      return
    }
    el.classList.remove('tab-glow')
    void el.offsetWidth
    el.classList.add('tab-glow')
    el.scrollIntoView({ inline: 'nearest', block: 'nearest' })
    return () => el.classList.remove('tab-glow')
  }, [flash])

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
            ref={flash?.id === tab.id ? flashRef : undefined}
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
