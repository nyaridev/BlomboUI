import { TilePreview } from '@/components/composites/models/TilePreview.tsx'
import type { ScopeThumb, ThumbScope } from '@/lib/api.ts'
import { memberThumb, thumbSrc } from '@/views/scopes/panels/groups/sections/scopeGroupUtils.ts'
import type { RefObject } from 'react'

export function ScopeGroupDetail({
  selected,
  ungrouped,
  name,
  busy,
  canSave,
  dirty,
  members,
  thumbs,
  extra,
  optional,
  lit,
  dragged,
  scopeDragRef,
  onName,
  onSave,
  onDelete,
  onMemberClick,
  onMemberMenu,
  onScopeDragStart,
  onScopeDragEnd,
}: {
  selected: string
  ungrouped: boolean
  name: string
  busy: boolean
  canSave: boolean
  dirty: boolean
  members: ThumbScope[]
  thumbs: ScopeThumb[]
  extra: string[]
  optional: string[]
  lit: { item: ThumbScope; thumb: ScopeThumb }[]
  dragged: RefObject<boolean>
  scopeDragRef: RefObject<string>
  onName: (name: string) => void
  onSave: () => void
  onDelete: () => void
  onMemberClick: (index: number) => void
  onMemberMenu: (x: number, y: number, id: string) => void
  onScopeDragStart: (id: string) => void
  onScopeDragEnd: (id: string) => void
}) {
  return selected ? (
    <>
      <div className="flex shrink-0 items-end gap-1">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
          Name
          <input
            className="h-8 rounded border border-line bg-field px-2 text-sm text-ink outline-none focus:border-accent disabled:opacity-50"
            value={name}
            disabled={ungrouped}
            onChange={(event) => onName(event.target.value)}
          />
        </label>
        {ungrouped ? null : (
          <>
            <button type="button" className="h-8 rounded bg-accent px-2 text-xs text-ink disabled:opacity-40" disabled={!canSave} onClick={onSave}>
              {dirty ? 'Save' : 'Saved'}
            </button>
            <button type="button" className="h-8 rounded border border-line px-2 text-xs text-ink disabled:opacity-40" disabled={busy} onClick={onDelete}>
              Delete
            </button>
          </>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {members.length === 0 ? (
          <p className="text-sm text-muted">No scopes in this group.</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,9rem))] gap-3">
            {members.map((item) => {
              const thumb = memberThumb(item.id, thumbs, extra, optional)
              const src = thumb ? thumbSrc(thumb) : null
              const rawSrc = thumb ? thumbSrc(thumb, true) : null
              return (
                <button
                  key={item.id}
                  type="button"
                  draggable
                  className={['text-left', scopeDragRef.current === item.id ? 'opacity-20' : ''].join(' ')}
                  onClick={() => {
                    if (!dragged.current) {
                      onMemberClick(lit.findIndex((row) => row.item.id === item.id))
                    }
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    onMemberMenu(event.clientX, event.clientY, item.id)
                  }}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', item.id)
                    dragged.current = true
                    onScopeDragStart(item.id)
                  }}
                  onDragEnd={() => {
                    onScopeDragEnd(item.id)
                    requestAnimationFrame(() => {
                      dragged.current = false
                    })
                  }}
                >
                  <TilePreview className="w-full" src={src} rawSrc={rawSrc} mark="?" label={item.name} />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </>
  ) : (
    <p className="text-sm text-muted">Select a group.</p>
  )
}
