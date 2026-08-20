import { Chevron } from '@/components/Chevron.tsx'
import { CloseIcon } from '@/components/CloseIcon.tsx'
import { Dialog } from '@/components/Dialog.tsx'
import { TilePreview } from '@/components/TilePreview.tsx'
import { getWorkflows, type WorkflowInfo } from '@/lib/api.ts'
import { useGenerateStore } from '@/stores/generateStore.ts'
import { useEffect, useState } from 'react'

const CATS = [
  { id: 'all', label: 'All' },
  { id: 'image', label: 'Image' },
  { id: 'video', label: 'Video' },
  { id: 'utility', label: 'Utility' },
] as const

function WorkflowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="1.5" y="1.5" width="5" height="4" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="7.5" y="8.5" width="5" height="4" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 5.5v2.2h5.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function AllIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="1.5" y="1.5" width="4.5" height="4.5" rx="0.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="8" y="1.5" width="4.5" height="4.5" rx="0.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="1.5" y="8" width="4.5" height="4.5" rx="0.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="8" y="8" width="4.5" height="4.5" rx="0.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function ImageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="1.5" y="2.5" width="11" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="4.5" cy="5.5" r="1" fill="currentColor" />
      <path d="M2.5 10.2 5.8 7.2 8 9.2 10 7.5 12.2 10.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function VideoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="1.5" y="3" width="11" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6 5.5 9 7 6 8.5Z" fill="currentColor" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <circle cx="5" cy="5" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7.4 7.4 10.2 10.2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function UtilityIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M8.8 2.4 11.6 5.2 6.2 10.6 3.4 11.6 4.4 8.8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M7.4 3.8 10.2 6.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

const CAT_ICON = {
  all: AllIcon,
  image: ImageIcon,
  video: VideoIcon,
  utility: UtilityIcon,
}

const ICON_BTN = 'flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-line hover:text-ink'

export function WorkflowPicker() {
  const workflow = useGenerateStore((s) => s.workflow)
  const setWorkflow = useGenerateStore((s) => s.setWorkflow)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<WorkflowInfo[]>([])
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState<(typeof CATS)[number]['id']>('all')

  useEffect(() => {
    if (!open) {
      return
    }
    setQuery('')
    setCat('all')
    void getWorkflows()
      .then(setItems)
      .catch(() => setItems([]))
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function pick(id: string) {
    setWorkflow(id)
    setOpen(false)
  }

  const q = query.trim().toLowerCase()
  const shown = items.filter((item) => {
    if (cat !== 'all' && (item.category || 'image') !== cat) {
      return false
    }
    if (q && !item.name.toLowerCase().includes(q) && !item.id.toLowerCase().includes(q)) {
      return false
    }
    return true
  })

  return (
    <>
      <button
        type="button"
        className="flex items-center gap-1.5 rounded border border-line px-2 py-1 text-sm text-ink hover:bg-line"
        onClick={() => setOpen(true)}
      >
        <span className="text-muted">
          <WorkflowIcon />
        </span>
        {workflow}
        <span className="text-muted">
          <Chevron dir="down" />
        </span>
      </button>
      {open ? (
        <Dialog
          onClose={() => setOpen(false)}
          className="flex h-[min(72vh,38rem)] w-[min(92vw,56rem)] min-w-0 flex-col gap-3"
        >
          <div className="-mx-3 -mt-3 flex items-center gap-2 border-b border-line px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">Workflows</span>
            <button type="button" className={ICON_BTN} aria-label="Close" onClick={() => setOpen(false)}>
              <CloseIcon />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 gap-4">
            <aside className="flex w-44 shrink-0 flex-col">
              <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
                {CATS.map((item, index) => {
                  const Icon = CAT_ICON[item.id]
                  const on = cat === item.id
                  return (
                    <div key={item.id} className="shrink-0">
                      {index === 1 ? <div className="my-1 border-t border-line" /> : null}
                      <button
                        type="button"
                        className={[
                          'flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm',
                          on ? 'bg-accent text-ink' : 'text-muted hover:bg-line hover:text-ink',
                        ].join(' ')}
                        onClick={() => setCat(item.id)}
                      >
                        <span className="shrink-0">
                          <Icon />
                        </span>
                        {item.label}
                      </button>
                    </div>
                  )
                })}
              </div>
            </aside>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="relative shrink-0">
                <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-muted">
                  <SearchIcon />
                </span>
                <input
                  className="w-full rounded border border-line bg-field py-1 pr-2 pl-7 text-xs text-ink outline-none placeholder:text-muted focus:border-accent"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  autoFocus
                />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2 pr-3">
                {shown.length === 0 ? (
                  <p className="text-xs text-muted">No workflows.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-4 pb-1">
                    {shown.map((item) => {
                      const current = item.id === workflow
                      return (
                        <div key={item.id} className="min-w-0 p-1.5">
                          <button
                            type="button"
                            title={item.name}
                            className={['w-full rounded', current ? 'ring-2 ring-ink ring-offset-2 ring-offset-panel' : ''].join(' ')}
                            onClick={() => pick(item.id)}
                          >
                            <TilePreview
                              className="w-full"
                              mark="?"
                              label={item.name}
                              badge={current ? 'current' : undefined}
                            />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Dialog>
      ) : null}
    </>
  )
}
