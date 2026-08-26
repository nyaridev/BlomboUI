import { setYamlDoc, yamlEditorExtensions } from '@/lib/yaml/cm.ts'
import { yamlIssues } from '@/lib/yaml/lint.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { useEffect, useMemo, useRef } from 'react'

export function YamlRawEditor({
  value,
  onChange,
  error,
}: {
  value: string
  onChange: (value: string) => void
  error?: string
}) {
  const parentRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const initial = useRef(value)
  const step = useSettingsStore((s) => s.promptWeightStep)
  const stepRef = useRef(step)
  onChangeRef.current = onChange
  stepRef.current = step

  useEffect(() => {
    const parent = parentRef.current
    if (!parent) {
      return
    }
    const view = new EditorView({
      state: EditorState.create({
        doc: initial.current,
        extensions: yamlEditorExtensions({
          onChange: (text) => onChangeRef.current(text),
          weightStep: () => stepRef.current,
        }),
      }),
      parent,
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (view) {
      setYamlDoc(view, value)
    }
  }, [value])

  const issues = useMemo(() => yamlIssues(value), [value])
  const banner = issues.length ? null : error

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-2">
      {banner ? <p className="text-xs text-red">{banner}</p> : null}
      <div
        ref={parentRef}
        className="yaml-cm min-h-64 min-w-0 flex-1 overflow-hidden rounded border border-line bg-field focus-within:border-accent"
      />
    </div>
  )
}
