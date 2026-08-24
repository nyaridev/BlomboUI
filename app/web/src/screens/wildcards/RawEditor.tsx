import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { continueLine, indentLines, isSingleLineChunk, moveLines, unindentLines } from '@/lib/prompt/textareaEdit.ts'
import { applyFoldEdit, foldYaml, yamlGuides } from '@/lib/yaml/fold.ts'
import { yamlErrorLines, yamlSpans } from '@/lib/yaml/lint.ts'
import { nudgePromptWeight } from '@/lib/prompt/weight.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

const FACE = 'col-start-1 row-start-1 min-h-64 min-w-0 py-1.5 font-mono text-sm leading-6 whitespace-pre'
const SHELL =
  'col-start-1 row-start-1 h-full min-h-64 w-full resize-none overflow-hidden px-2 py-1.5 font-mono text-sm leading-6 text-ink outline-none'

function useRawEditorKeys(onChange: (value: string) => void, yaml = false) {
  const step = useSettingsStore((s) => s.promptWeightStep)
  const pending = useRef<{ el: HTMLTextAreaElement; start: number; end: number } | null>(null)

  useLayoutEffect(() => {
    const next = pending.current
    if (!next) {
      return
    }
    pending.current = null
    if (document.contains(next.el)) {
      next.el.setSelectionRange(next.start, next.end)
    }
  })

  return (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.defaultPrevented) {
      return
    }
    const el = event.currentTarget
    if (el.disabled || el.readOnly) {
      return
    }
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const ctrl = event.ctrlKey || event.metaKey

    if (event.key === 'Tab' && !ctrl && !event.altKey) {
      event.preventDefault()
      const next = event.shiftKey ? unindentLines(el.value, start, end) : indentLines(el.value, start, end)
      pending.current = { el, start: next.start, end: next.end }
      onChange(next.text)
      return
    }

    if (event.key === 'Enter' && !ctrl && !event.altKey) {
      event.preventDefault()
      const next = continueLine(el.value, start, end, yaml)
      pending.current = { el, start: next.start, end: next.end }
      onChange(next.text)
      return
    }

    if (event.shiftKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) {
      return
    }
    if (event.altKey && !ctrl) {
      event.preventDefault()
      const next = moveLines(el.value, start, end, event.key === 'ArrowUp' ? -1 : 1)
      if (!next) {
        return
      }
      pending.current = { el, start: next.start, end: next.end }
      onChange(next.text)
      return
    }
    if (!ctrl || event.altKey || !isSingleLineChunk(el.value, start, end)) {
      return
    }
    const next = nudgePromptWeight(el.value, start, end, event.key === 'ArrowUp' ? 1 : -1, step)
    if (!next) {
      return
    }
    event.preventDefault()
    pending.current = { el, start: next.start, end: next.end }
    onChange(next.text)
  }
}

function spanClass(kind: string) {
  if (kind === 'key') {
    return 'yaml-hl-key'
  }
  if (kind === 'dash') {
    return 'yaml-hl-dash'
  }
  if (kind === 'punct' || kind === 'comment') {
    return 'yaml-hl-muted'
  }
  return ''
}

function depthClass(indent: number) {
  return `yaml-d${(((Math.floor(indent / 2) % 10) + 10) % 10)}`
}

export function RawEditor({
  value,
  onChange,
  error,
  yaml,
}: {
  value: string
  onChange: (value: string) => void
  error?: string
  yaml?: boolean
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const view = useMemo(() => (yaml ? foldYaml(value, collapsed) : null), [collapsed, value, yaml])
  const shown = view?.text ?? value
  const lint = useMemo(() => (yaml ? yamlErrorLines(value, error) : { messages: new Map<number, string>() }), [error, value, yaml])
  const banner = yaml && lint.messages.size ? null : error
  const lines = shown.split('\n')
  const digits = String(Math.max(1, view?.lines.length ?? lines.length)).length
  const guides = useMemo(() => (view ? yamlGuides(view.lines, view.blocks) : []), [view])
  const foldAt = useMemo(() => {
    const map = new Map<number, { path: string; open: boolean }>()
    if (!view) {
      return map
    }
    for (const block of view.blocks) {
      if (block.end > block.start + 1) {
        map.set(block.start, { path: block.path, open: !collapsed.has(block.path) })
      }
    }
    return map
  }, [collapsed, view])

  function commit(next: string) {
    onChange(yaml ? applyFoldEdit(value, collapsed, next) : next)
  }

  const onKeyDown = useRawEditorKeys(commit, yaml)

  function toggle(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  return (
    <div className="flex flex-col gap-2">
      {banner ? <p className="text-xs text-red">{banner}</p> : null}
      <div className="flex min-h-64 min-w-0 rounded border border-line bg-field focus-within:border-accent">
        <div className="flex shrink-0 select-none flex-col self-stretch rounded-l bg-[color-mix(in_srgb,var(--color-bg)_40%,var(--color-field))] py-1.5 pl-2">
          {lines.map((_, index) => {
            const src = view?.srcOf[index] ?? index
            const fold = yaml ? foldAt.get(src) : undefined
            return (
              <div key={index} className="flex h-6 items-center gap-0.5">
                <span
                  className="inline-flex shrink-0 justify-end font-mono text-xs tabular-nums text-muted"
                  style={{ width: `${Math.max(2, digits)}ch`, minWidth: `${Math.max(2, digits)}ch` }}
                >
                  {src + 1}
                </span>
                {yaml ? (
                  fold ? (
                    <button
                      type="button"
                      className="flex h-6 w-4 items-center justify-center text-muted hover:text-ink"
                      aria-label={fold.open ? 'Collapse section' : 'Expand section'}
                      title={fold.open ? 'Collapse section' : 'Expand section'}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => toggle(fold.path)}
                    >
                      <AppIcon id={fold.open ? 'chevron-down' : 'chevron-right'} size={10} />
                    </button>
                  ) : (
                    <div className="h-6 w-4" />
                  )
                ) : null}
              </div>
            )
          })}
        </div>
        <div className="grid min-h-64 min-w-0 flex-1">
          <pre
            aria-hidden="true"
            className={['pointer-events-none bg-transparent', FACE, yaml ? 'yaml-hl' : 'invisible px-2'].join(' ')}
          >
            {yaml
              ? lines.map((line, index) => {
                  const src = view?.srcOf[index] ?? index
                  const note = lint.messages.get(src)
                  return (
                    <div key={index} className={['relative h-6 px-2', note ? 'yaml-hl-error' : ''].join(' ')}>
                      {(guides[src] || []).map((indent) => (
                        <span
                          key={indent}
                          className={`yaml-guide ${depthClass(indent)}`}
                          style={{ left: `calc(0.5rem + ${indent}ch)` }}
                        />
                      ))}
                      {yamlSpans(line).map((span, i) => (
                        <span key={i} className={spanClass(span.kind)}>
                          {span.text}
                        </span>
                      ))}
                      {line ? null : ' '}
                      {note ? <span className="yaml-hl-note">{note}</span> : null}
                    </div>
                  )
                })
              : value || ' '}
          </pre>
          <textarea
            className={yaml ? `${SHELL} bg-transparent text-transparent caret-ink selection:bg-accent/30` : `${SHELL}`}
            value={shown}
            onChange={(event) => commit(event.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            wrap="off"
          />
        </div>
      </div>
    </div>
  )
}
