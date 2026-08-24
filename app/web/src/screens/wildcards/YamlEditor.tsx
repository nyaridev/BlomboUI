import { useEffect, useState } from 'react'
import type { YamlNode } from '@/lib/api.ts'
import { ConfirmDialog } from '@/components/primitives/Dialog.tsx'
import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { LineList } from './LineList.tsx'

function uniqueKey(map: Record<string, unknown>, base: string) {
  const name = base.trim() || 'section'
  if (!(name in map)) {
    return name
  }
  let i = 2
  while (`${name}_${i}` in map) {
    i += 1
  }
  return `${name}_${i}`
}

function renameKey(map: Record<string, YamlNode>, from: string, to: string) {
  if (from === to) {
    return map
  }
  const next: Record<string, YamlNode> = {}
  for (const [key, node] of Object.entries(map)) {
    next[key === from ? to : key] = node
  }
  return next
}

function omitKey(map: Record<string, YamlNode>, key: string) {
  const next = { ...map }
  delete next[key]
  return next
}

function hasContent(node: YamlNode) {
  return Array.isArray(node) ? node.length > 0 : Object.keys(node).length > 0
}

function liftKey(map: Record<string, YamlNode>, key: string): YamlNode {
  const child = map[key]
  if (!child || Array.isArray(child)) {
    return Array.isArray(child) ? child : omitKey(map, key)
  }
  const next: Record<string, YamlNode> = {}
  for (const [k, v] of Object.entries(map)) {
    if (k !== key) {
      next[k] = v
      continue
    }
    for (const [ck, cv] of Object.entries(child)) {
      next[uniqueKey(next, ck)] = cv
    }
  }
  return next
}

function depthClass(depth: number) {
  return `yaml-d${((depth % 10) + 10) % 10}`
}

function AddRow({
  depth,
  to,
  onLine,
  onSection,
}: {
  depth: number
  to?: string
  onLine?: () => void
  onSection: () => void
}) {
  const tint = depthClass(depth)
  const label = to ? `Add Section to ${to}` : 'Add Section'
  return (
    <div className="flex gap-1.5">
      <button type="button" className={`yaml-add-section ${tint}`} aria-label={label} title={label} onClick={onSection}>
        {to ? (
          <span>
            Add Section to <span className="font-bold">{to}</span>
          </span>
        ) : (
          'Add Section'
        )}
      </button>
      {onLine ? (
        <button type="button" className={`yaml-add ${tint}`} aria-label="Add line" title="Add line" onClick={onLine}>
          <AppIcon id="plus" size={14} />
        </button>
      ) : null}
    </div>
  )
}

function YamlMap({
  value,
  onChange,
  depth,
}: {
  value: Record<string, YamlNode>
  onChange: (value: YamlNode) => void
  depth: number
}) {
  const [pending, setPending] = useState<string | null>(null)

  function canLift(key: string) {
    const child = value[key]
    if (!child || !hasContent(child)) {
      return false
    }
    if (!Array.isArray(child)) {
      return true
    }
    return depth > 0 && Object.keys(value).length === 1
  }

  function requestRemove(key: string) {
    const child = value[key]
    if (!child || !hasContent(child)) {
      onChange(omitKey(value, key))
      return
    }
    setPending(key)
  }

  return (
    <div className={depth === 0 ? 'flex flex-col gap-3' : 'flex flex-col gap-2'}>
      {Object.entries(value).map(([key, node]) => (
        <YamlSection
          key={key}
          name={key}
          node={node}
          depth={depth}
          onRename={(next) => {
            const name = uniqueKey(omitKey(value, key), next)
            onChange(renameKey(value, key, name))
          }}
          onChange={(next) => onChange({ ...value, [key]: next })}
          onRemove={() => requestRemove(key)}
        />
      ))}
      {pending && value[pending] ? (
        <ConfirmDialog
          title={`Remove ${pending}?`}
          body={
            canLift(pending)
              ? 'Move sections and entries under this section up one level, or remove them too?'
              : 'This section and everything under it will be removed.'
          }
          onClose={() => setPending(null)}
          actions={[
            { label: 'Cancel', onClick: () => setPending(null) },
            {
              label: 'Remove',
              kind: 'primary',
              danger: true,
              onClick: () => {
                onChange(omitKey(value, pending))
                setPending(null)
              },
            },
            ...(canLift(pending)
              ? [
                  {
                    label: 'Move up',
                    kind: 'primary' as const,
                    onClick: () => {
                      onChange(liftKey(value, pending))
                      setPending(null)
                    },
                  },
                ]
              : []),
          ]}
        />
      ) : null}
    </div>
  )
}

function YamlSection({
  name,
  node,
  depth,
  onRename,
  onChange,
  onRemove,
}: {
  name: string
  node: YamlNode
  depth: number
  onRename: (name: string) => void
  onChange: (node: YamlNode) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(true)
  const [title, setTitle] = useState(name)
  const list = Array.isArray(node)
  const empty = !list && Object.keys(node).length === 0
  const tint = depthClass(depth)

  useEffect(() => {
    setTitle(name)
  }, [name])

  return (
    <div className={[tint, depth === 0 ? 'yaml-card' : ''].filter(Boolean).join(' ')}>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="flex h-8 w-8 shrink-0 items-center justify-center text-muted"
          aria-label={open ? 'Collapse section' : 'Expand section'}
          onClick={() => setOpen((on) => !on)}
        >
          <AppIcon id={open ? 'chevron-down' : 'chevron-right'} size={10} />
        </button>
        <input
          className="box-border h-8 min-w-0 flex-1 rounded border border-line bg-bg px-2 py-0 font-mono text-sm leading-[1.875rem] text-ink outline-none focus:border-accent"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => onRename(title)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur()
            }
          }}
        />
        <button type="button" className="icon-btn shrink-0" aria-label="Remove section" onClick={onRemove}>
          <AppIcon id="x" />
        </button>
      </div>
      {open ? (
        <div className="yaml-kids mt-2 flex flex-col gap-2">
          {list && node.length > 0 ? (
            <LineList value={node} onChange={onChange} depth={depth} />
          ) : list || empty ? (
            <AddRow
              depth={depth}
              to={title.trim() || name}
              onLine={() => onChange([''])}
              onSection={() => onChange({ [uniqueKey({}, 'section')]: {} })}
            />
          ) : (
            <>
              <YamlMap value={node} onChange={onChange} depth={depth + 1} />
              <AddRow
                depth={depth}
                to={title.trim() || name}
                onSection={() => onChange({ ...node, [uniqueKey(node, 'section')]: {} })}
              />
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

export function YamlEditor({
  value,
  onChange,
}: {
  value: Record<string, YamlNode>
  onChange: (value: Record<string, YamlNode>) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <YamlMap
        value={value}
        onChange={(next) => {
          if (!Array.isArray(next)) {
            onChange(next)
          }
        }}
        depth={0}
      />
      <AddRow
        depth={0}
        onLine={() => onChange({ ...value, [uniqueKey(value, 'section')]: [''] })}
        onSection={() => onChange({ ...value, [uniqueKey(value, 'section')]: {} })}
      />
    </div>
  )
}
