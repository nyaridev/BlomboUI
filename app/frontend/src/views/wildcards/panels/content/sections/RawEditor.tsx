import { continueLine, indentLines, isSingleLineChunk, moveLines, unindentLines } from '@/lib/prompt/textareaEdit.ts'
import { nudgePromptWeight } from '@/lib/prompt/weight.ts'
import { YamlRawEditor } from '@/views/wildcards/panels/content/sections/YamlRawEditor.tsx'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useLayoutEffect, useRef, type KeyboardEvent } from 'react'

const SHELL =
  'min-h-64 w-full resize-none px-2 py-1.5 font-mono text-sm leading-6 text-ink outline-none'

function useRawEditorKeys(onChange: (value: string) => void) {
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
      const next = continueLine(el.value, start, end, false)
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
  const onKeyDown = useRawEditorKeys(onChange)
  if (yaml) {
    return <YamlRawEditor value={value} onChange={onChange} error={error} />
  }
  return (
    <div className="flex flex-col gap-2">
      {error ? <p className="text-xs text-red">{error}</p> : null}
      <div className="flex min-h-64 min-w-0 rounded border border-line bg-field focus-within:border-accent">
        <textarea
          className={`${SHELL} rounded bg-transparent`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          wrap="off"
        />
      </div>
    </div>
  )
}
