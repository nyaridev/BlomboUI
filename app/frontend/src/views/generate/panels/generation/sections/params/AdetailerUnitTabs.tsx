import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { ContextMenu, ContextMenuItem } from '@/components/composites/chrome/ContextMenu.tsx'
import { IconButton } from '@/components/controls/button/IconButton.tsx'
import { NameDialog } from '@/components/controls/dialog/NameDialog.tsx'
import { tabTriggerClass } from '@/components/controls/tabs/TabsControl.tsx'
import { CheckboxControl } from '@/components/controls/toggle/CheckboxControl.tsx'
import { newAdetailerUnit, type AdetailerUnit } from '@/stores/generateStore.ts'
import { useState } from 'react'

export function AdetailerUnitTabs({
  units,
  active,
  onActive,
  onChange,
  locked = false,
}: {
  units: AdetailerUnit[]
  active: string
  onActive: (id: string) => void
  onChange: (units: AdetailerUnit[]) => void
  locked?: boolean
}) {
  const [drag, setDrag] = useState<number | null>(null)
  const [slot, setSlot] = useState<number | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null)
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null)

  function moving() {
    return drag !== null && slot !== null && slot !== drag && slot !== drag + 1
  }

  function applyDrop() {
    if (!moving() || drag === null || slot === null) {
      return
    }
    const next = [...units]
    const [item] = next.splice(drag, 1)
    next.splice(drag < slot ? slot - 1 : slot, 0, item)
    onChange(next)
  }

  function removeUnit(id: string) {
    if (units.length < 2) {
      return
    }
    const index = units.findIndex((row) => row.id === id)
    const next = units.filter((row) => row.id !== id)
    onChange(next)
    if (id === active) {
      onActive(next[Math.max(0, index - 1)]?.id || next[0].id)
    }
  }

  function saveRename() {
    const name = rename?.name.trim()
    if (!rename || !name) {
      return
    }
    onChange(units.map((row) => (row.id === rename.id ? { ...row, name } : row)))
    setRename(null)
  }

  function openRename(id: string) {
    const unit = units.find((row) => row.id === id)
    if (!unit) {
      return
    }
    setMenu(null)
    setRename({ id: unit.id, name: unit.name })
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-cluster">
      {units.map((unit, index) => (
        <div
          key={unit.id}
          role="button"
          tabIndex={0}
          className={tabTriggerClass(
            unit.id === active,
            [
              drag === index ? 'opacity-40' : '',
              unit.enabled === false && drag !== index ? 'opacity-50' : '',
              'gap-1',
            ]
              .filter(Boolean)
              .join(' '),
            'panel',
            'pl-2 pr-0.5',
          )}
          draggable={!locked}
          onClick={() => onActive(unit.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onActive(unit.id)
            }
          }}
          onContextMenu={(event) => {
            if (locked) {
              return
            }
            event.preventDefault()
            onActive(unit.id)
            setMenu({ x: event.clientX, y: event.clientY, id: unit.id })
          }}
          onDragStart={(event) => {
            if ((event.target as HTMLElement).closest('button, input, [data-unit-check]')) {
              event.preventDefault()
              return
            }
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', unit.id)
            setDrag(index)
            setSlot(index)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            if (drag === null) {
              return
            }
            setSlot(index === drag ? drag : index < drag ? index : index + 1)
          }}
          onDrop={(event) => {
            event.preventDefault()
            applyDrop()
          }}
          onDragEnd={() => {
            setDrag(null)
            setSlot(null)
          }}
        >
          <span
            data-unit-check=""
            className="inline-flex pr-1"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <CheckboxControl
              checked={unit.enabled !== false}
              disabled={locked}
              onChange={(enabled) => {
                onChange(units.map((row) => (row.id === unit.id ? { ...row, enabled } : row)))
                if (enabled) {
                  onActive(unit.id)
                }
              }}
            />
          </span>
          <span>{unit.name || `ADetailer ${index + 1}`}</span>
          {locked ? null : (
            <IconButton
              tone="ghost"
              aria-label={`Rename ${unit.name || 'unit'}`}
              onClick={(event) => {
                event.stopPropagation()
                openRename(unit.id)
              }}
            >
              <AppIcon id="pencil" size={12} />
            </IconButton>
          )}
          {units.length > 1 && !locked ? (
            <IconButton
              tone="ghost"
              aria-label={`Remove ${unit.name || 'unit'}`}
              onClick={(event) => {
                event.stopPropagation()
                removeUnit(unit.id)
              }}
            >
              <AppIcon id="x" size={12} />
            </IconButton>
          ) : null}
        </div>
      ))}
      {locked ? null : (
        <IconButton
          aria-label="Add ADetailer unit"
          onClick={() => {
            const unit = newAdetailerUnit(`ADetailer ${units.length + 1}`)
            onChange([...units, unit])
            onActive(unit.id)
          }}
        >
          <AppIcon id="plus" />
        </IconButton>
      )}
      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <ContextMenuItem label="Rename" onClick={() => openRename(menu.id)} />
          {units.length > 1 ? (
            <ContextMenuItem
              label="Remove"
              danger
              onClick={() => {
                removeUnit(menu.id)
                setMenu(null)
              }}
            />
          ) : null}
        </ContextMenu>
      ) : null}
      {rename ? (
        <NameDialog
          title="Rename unit"
          name={rename.name}
          selectAllOnOpen
          onName={(name) => setRename({ ...rename, name })}
          onClose={() => setRename(null)}
          actions={[
            { label: 'Cancel', kind: 'ghost', onClick: () => setRename(null) },
            { label: 'Save', kind: 'primary', submit: true, disabled: !rename.name.trim(), onClick: saveRename },
          ]}
        />
      ) : null}
    </div>
  )
}
