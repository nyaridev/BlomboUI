import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { Dialog } from '@/components/controls/dialog/Dialog.tsx'
import { TilePreview } from '@/components/composites/models/TilePreview.tsx'
import { getWorkflows, type WorkflowInfo } from '@/lib/api.ts'
import { useGenerateStore } from '@/stores/generateStore.ts'
import { useEffect, useState } from 'react'

const CATS = [
  { id: 'all', label: 'All', icon: 'layers' },
  { id: 'image', label: 'Image', icon: 'image' },
  { id: 'video', label: 'Video', icon: 'clapperboard' },
  { id: 'utility', label: 'Utility', icon: 'wrench' },
] as const

function catIcon(category?: string) {
  const id = category === 'video' || category === 'utility' ? category : 'image'
  return CATS.find((item) => item.id === id)?.icon ?? 'image'
}

const ICON_BTN = 'flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-line hover:text-ink'
const CHIP =
  'flex h-8 shrink-0 items-center gap-1.5 rounded border border-line bg-field px-2 text-sm text-ink hover:bg-line'

export function WorkflowPicker() {
  const workflow = useGenerateStore((s) => s.workflow)
  const setWorkflow = useGenerateStore((s) => s.setWorkflow)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<WorkflowInfo[]>([])
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState<(typeof CATS)[number]['id']>('all')
  const current = items.find((item) => item.id === workflow)

  useEffect(() => {
    void getWorkflows()
      .then(setItems)
      .catch(() => setItems([]))
  }, [])

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
    setWorkflow(id, items.find((item) => item.id === id)?.defaults)
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
      <button type="button" className={CHIP} onClick={() => setOpen(true)}>
        <span className="text-muted">
          <AppIcon id={catIcon(current?.category)} />
        </span>
        {current?.name || workflow}
        <span className="text-muted">
          <AppIcon id="chevron-down" size={12} />
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
              <AppIcon id="x" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 gap-4">
            <aside className="flex w-44 shrink-0 flex-col">
              <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
                {CATS.map((item, index) => {
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
                          <AppIcon id={item.icon} />
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
                  <AppIcon id="search" size={12} />
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
