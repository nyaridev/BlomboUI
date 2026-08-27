import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { IconPicker } from '@/components/composites/chrome/IconPicker.tsx'
import { glyphOf, type Glyph } from '@/components/composites/chrome/glyph.ts'
import { TemplateList } from '@/components/composites/templates/TemplateList.tsx'
import { TemplateParamsForm } from '@/components/composites/templates/TemplateParamsForm.tsx'
import { ButtonControl } from '@/components/controls/button/ButtonControl.tsx'
import { IconButton } from '@/components/controls/button/IconButton.tsx'
import { applyOf, paramsEqual, paramsOf, useGenerateStore, type TemplateParams } from '@/stores/generateStore.ts'
import {
  getWorkflows,
  setTemplateApply,
  updateTemplate,
  type TemplateInfo,
} from '@/lib/api.ts'
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

type TemplatePickerProps = {
  items: TemplateInfo[]
  workflow: string
  onClose: () => void
  onItems: Dispatch<SetStateAction<TemplateInfo[]>>
  onCreate: () => void
  onRename: (id: string) => void
  onDelete: (id: string) => void
  onReorder: (ids: string[]) => void
  onApply: (id: string, params: TemplateParams, apply: string[]) => void
  onApplyAll: (items: TemplateInfo[]) => void
}

export function TemplatePicker({
  items,
  workflow,
  onClose,
  onItems,
  onCreate,
  onRename,
  onDelete,
  onReorder,
  onApply,
  onApplyAll,
}: TemplatePickerProps) {
  const viewedId = useGenerateStore((s) => s.viewedTemplateByWorkflow[workflow])
  const selectedId = items.some((item) => item.id === viewedId) ? viewedId : (items[0]?.id ?? 'default')
  const selected = items.find((item) => item.id === selectedId) ?? items[0]
  const locked = Boolean(selected?.builtin)
  const [editor, setEditor] = useState<TemplateParams>(() => paramsOf(selected ?? { builtin: true }))
  const [apply, setApply] = useState<string[]>(() => applyOf(selected?.apply))
  const [error, setError] = useState<string | null>(null)
  const [workflowParams, setWorkflowParams] = useState<string[]>([])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const itemsRef = useRef(items)
  itemsRef.current = items

  useEffect(() => {
    let alive = true
    void getWorkflows()
      .then((workflows) => {
        if (!alive) {
          return
        }
        setWorkflowParams(workflows.find((item) => item.id === workflow)?.params ?? [])
      })
      .catch(() => {
        if (alive) {
          setWorkflowParams([])
        }
      })
    return () => {
      alive = false
    }
  }, [workflow])

  useEffect(() => {
    const item = itemsRef.current.find((entry) => entry.id === selectedId) ?? itemsRef.current[0]
    if (!item) {
      return
    }
    setEditor(paramsOf(item))
    setApply(applyOf(item.apply))
    setError(null)
  }, [selectedId])

  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
      }
    }
  }, [])

  function persistParams(id: string, params: TemplateParams) {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
    }
    saveTimer.current = setTimeout(() => {
      const item = itemsRef.current.find((entry) => entry.id === id)
      if (!item || item.builtin || paramsEqual(params, paramsOf(item))) {
        return
      }
      void updateTemplate(workflow, id, params)
        .then((saved) => onItems((current) => current.map((entry) => (entry.id === saved.id ? { ...entry, ...saved } : entry))))
        .catch((err) => setError(err instanceof Error ? err.message : 'Save failed'))
    }, 300)
  }

  async function persistApply(id: string, next: string[]) {
    setApply(next)
    try {
      if (id === 'default') {
        const saved = await setTemplateApply(workflow, next)
        onItems((current) => current.map((entry) => (entry.builtin ? { ...entry, apply: saved } : entry)))
        return
      }
      const saved = await updateTemplate(workflow, id, undefined, undefined, undefined, next)
      onItems((current) => current.map((entry) => (entry.id === saved.id ? { ...entry, ...saved } : entry)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update apply')
    }
  }

  async function persistEnabled(id: string, enabled: boolean) {
    try {
      const saved = await updateTemplate(workflow, id, undefined, undefined, undefined, undefined, enabled)
      onItems((current) => current.map((entry) => (entry.id === saved.id ? { ...entry, ...saved } : entry)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update template')
    }
  }

  async function persistIcon(icon: Glyph) {
    if (!selected || locked) {
      return
    }
    try {
      const saved = await updateTemplate(workflow, selected.id, undefined, undefined, icon)
      onItems((current) => current.map((entry) => (entry.id === saved.id ? { ...entry, ...saved } : entry)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Icon failed')
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-stack">
      <div className="flex items-center gap-cluster border-b border-line pb-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">Templates</span>
        <IconButton aria-label="Close" onClick={onClose}>
          <AppIcon id="x" />
        </IconButton>
      </div>
      <div className="flex min-h-0 flex-1 gap-stack">
        <TemplateList
          items={items}
          selectedId={selected?.id ?? 'default'}
          onSelect={(id) => useGenerateStore.getState().setViewedTemplateId(id)}
          onToggle={(id, enabled) => void persistEnabled(id, enabled)}
          onReorder={onReorder}
          onRename={onRename}
          onDelete={onDelete}
          onCreate={onCreate}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-line bg-bg">
          <div className="flex h-toolbar shrink-0 items-center gap-cluster border-b border-line px-2.5">
            <IconPicker
              value={glyphOf(selected ?? { builtin: true })}
              disabled={locked}
              onChange={(icon) => void persistIcon(icon)}
            />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{selected?.name ?? 'Template'}</span>
            {locked ? <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted">Default</span> : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <TemplateParamsForm
              value={editor}
              apply={apply}
              locked={locked}
              workflowParams={workflowParams}
              onChange={(next) => {
                setEditor(next)
                if (selected && !locked) {
                  persistParams(selected.id, next)
                }
              }}
              onApplyChange={(next) => {
                if (selected) {
                  void persistApply(selected.id, next)
                }
              }}
            />
          </div>
        </div>
      </div>
      {error ? <p className="text-xs text-accent">{error}</p> : null}
      <div className="flex justify-end gap-cluster">
        <ButtonControl size="sm" tone="ghost" onClick={() => selected && onApply(selected.id, editor, apply)}>
          Apply
        </ButtonControl>
        <ButtonControl
          size="sm"
          onClick={() =>
            onApplyAll(
              items.map((item) =>
                item.id === selected?.id
                  ? item.builtin
                    ? { ...item, apply }
                    : { ...item, params: editor, apply }
                  : item,
              ),
            )
          }
        >
          Apply All
        </ButtonControl>
      </div>
    </div>
  )
}
