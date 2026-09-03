import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { ContextMenu, ContextMenuItem } from '@/components/composites/chrome/ContextMenu.tsx'
import { Dialog } from '@/components/controls/dialog/Dialog.tsx'
import { getWorkflows, type WorkflowInfo } from '@/lib/api.ts'
import { applySetWorkflow, reorderId, toggleId } from '@/stores/generatePersist.ts'
import { mergeParams, pickParams, useGenerateStore, type TemplateParams } from '@/stores/generateStore.ts'
import { Fragment, useEffect, useRef, useState } from 'react'

function catIcon(category?: string) {
  return category === 'utility' ? 'wrench' : 'image'
}

function matches(item: WorkflowInfo, q: string) {
  if (!q) {
    return true
  }
  return item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)
}

const ICON_BTN = 'flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-line hover:text-ink'
const CHIP = 'flex h-8 shrink-0 items-center gap-1.5 rounded border border-line bg-field px-2 text-sm text-ink hover:bg-line'

type Menu = { x: number; y: number; id: string }

export function WorkflowPicker() {
  const workflow = useGenerateStore((s) => s.workflow)
  const favoriteWorkflowIds = useGenerateStore((s) => s.favoriteWorkflowIds)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<WorkflowInfo[]>([])
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState<Menu | null>(null)
  const current = items.find((item) => item.id === workflow)
  const favored = new Set(favoriteWorkflowIds)

  function close() {
    setMenu(null)
    setOpen(false)
  }

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
    setMenu(null)
    void getWorkflows()
      .then(setItems)
      .catch(() => setItems([]))
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return
      }
      if (menu) {
        setMenu(null)
        return
      }
      close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, menu])

  function pick(id: string) {
    const defaults = items.find((item) => item.id === id)?.defaults
    useGenerateStore.setState((s) => ({
      ...applySetWorkflow(s, id, defaults, {
        pickParams,
        mergeParams: (raw) => mergeParams(raw as Partial<TemplateParams> | Record<string, unknown> | undefined),
      }),
    }))
    close()
  }

  function toggleFavorite(id: string) {
    useGenerateStore.setState((s) => ({
      favoriteWorkflowIds: toggleId(s.favoriteWorkflowIds, id),
    }))
    setMenu(null)
  }

  function reorderFavorites(draggedId: string, targetId: string, before: boolean) {
    useGenerateStore.setState((s) => ({
      favoriteWorkflowIds: reorderId(s.favoriteWorkflowIds, draggedId, targetId, before),
    }))
  }

  const q = query.trim().toLowerCase()
  const byId = new Map(items.map((item) => [item.id, item]))
  const favorites = favoriteWorkflowIds.map((id) => byId.get(id)).filter((item): item is WorkflowInfo => !!item && matches(item, q))
  const image = items.filter((item) => item.category !== 'utility' && matches(item, q))
  const utility = items.filter((item) => item.category === 'utility' && matches(item, q))
  const empty = favorites.length === 0 && image.length === 0 && utility.length === 0
  const menuItem = menu ? byId.get(menu.id) : undefined

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
          onClose={() => {
            if (menu) {
              setMenu(null)
              return
            }
            setOpen(false)
          }}
          className="flex h-[min(72vh,38rem)] w-[min(92vw,28rem)] min-w-0 flex-col gap-3"
        >
          <div className="-mx-3 -mt-3 flex items-center gap-2 border-b border-line px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">Workflows</span>
            <button type="button" className={ICON_BTN} aria-label="Close" onClick={close}>
              <AppIcon id="x" />
            </button>
          </div>
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
          <div className="min-h-0 flex-1 overflow-y-auto">
            {empty ? (
              <p className="text-xs text-muted">No workflows.</p>
            ) : (
              <>
                <Section title="Favorites" items={favorites} prefix="favorite" workflow={workflow} favored={favored} onPick={pick} onMenu={setMenu} onReorder={q ? undefined : reorderFavorites} />
                <Section title="Image" items={image} prefix="image" workflow={workflow} favored={favored} onPick={pick} onMenu={setMenu} />
                <Section title="Utility" items={utility} prefix="utility" workflow={workflow} favored={favored} onPick={pick} onMenu={setMenu} />
              </>
            )}
          </div>
        </Dialog>
      ) : null}
      {menu && menuItem ? (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <ContextMenuItem
            icon="star"
            label={favored.has(menu.id) ? 'Unfavorite' : 'Favorite'}
            danger={favored.has(menu.id)}
            tone={favored.has(menu.id) ? 'default' : 'accent'}
            iconClassName={favored.has(menu.id) ? '' : 'fill-current'}
            onClick={() => toggleFavorite(menu.id)}
          />
        </ContextMenu>
      ) : null}
    </>
  )
}

function Section({
  title,
  items,
  prefix,
  workflow,
  favored,
  onPick,
  onMenu,
  onReorder,
}: {
  title: string
  items: WorkflowInfo[]
  prefix: string
  workflow: string
  favored: Set<string>
  onPick: (id: string) => void
  onMenu: (menu: Menu) => void
  onReorder?: (draggedId: string, targetId: string, before: boolean) => void
}) {
  const [drag, setDrag] = useState<number | null>(null)
  const [slot, setSlot] = useState<number | null>(null)
  const dragged = useRef(false)
  const moving = drag !== null && slot !== null && slot !== drag && slot !== drag + 1

  function applyDrop() {
    if (!moving || drag === null || slot === null || !onReorder) {
      return
    }
    const targetIndex = slot === items.length ? slot - 1 : slot
    const target = items[targetIndex]
    if (target) {
      onReorder(items[drag].id, target.id, slot !== items.length)
    }
  }

  if (items.length === 0) {
    return null
  }
  return (
    <div
      className="select-menu-group"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        applyDrop()
        setDrag(null)
        setSlot(null)
      }}
    >
      <div
        className="select-menu-section font-medium uppercase tracking-[0.12em]"
        style={{ color: 'var(--color-muted)' }}
      >
        {title}
      </div>
      {items.map((item) => {
        const on = item.id === workflow
        const star = favored.has(item.id)
        return (
          <Fragment key={`${prefix}:${item.id}`}>
            {moving && slot === items.indexOf(item) ? <span className="mb-0.5 block h-0.5 rounded-full bg-accent" /> : null}
            <div
              className={['flex items-center', drag === items.indexOf(item) ? 'opacity-20' : ''].join(' ')}
              onDragOver={(event) => {
                if (!onReorder) {
                  return
                }
                event.preventDefault()
                event.stopPropagation()
                const box = event.currentTarget.getBoundingClientRect()
                const index = items.indexOf(item)
                setSlot(event.clientY < box.top + box.height / 2 ? index : index + 1)
              }}
              onDrop={(event) => {
                event.preventDefault()
                event.stopPropagation()
                applyDrop()
                setDrag(null)
                setSlot(null)
              }}
            >
              <button
                type="button"
                draggable={Boolean(onReorder)}
                title={item.name}
                className={[
                  'flex h-toolbar min-w-0 flex-1 items-center gap-cluster rounded px-2 text-left text-sm',
                  onReorder ? 'cursor-grab active:cursor-grabbing' : '',
                  on ? 'bg-accent text-ink' : 'text-ink hover:bg-line',
                ].join(' ')}
                onDragStart={(event) => {
                  if (!onReorder) {
                    return
                  }
                  dragged.current = false
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', item.id)
                  setDrag(items.indexOf(item))
                  setSlot(items.indexOf(item))
                }}
                onDrag={() => {
                  dragged.current = true
                }}
                onDragEnd={() => {
                  setDrag(null)
                  setSlot(null)
                }}
                onClick={() => {
                  if (dragged.current) {
                    dragged.current = false
                    return
                  }
                  onPick(item.id)
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  onMenu({ x: event.clientX, y: event.clientY, id: item.id })
                }}
              >
                <span className="shrink-0 text-muted">
                  <AppIcon id={catIcon(item.category)} />
                </span>
                <span className="min-w-0 truncate">{item.name}</span>
                {star ? <AppIcon id="star" size={12} className="ml-auto fill-current text-yellow" /> : null}
              </button>
            </div>
          </Fragment>
        )
      })}
      {moving && slot === items.length ? <span className="mt-0.5 block h-0.5 rounded-full bg-accent" /> : null}
    </div>
  )
}
