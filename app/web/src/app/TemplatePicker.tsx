import { AppIcon } from '@/components/AppIcon.tsx'
import { ConfirmDialog, Dialog } from '@/components/Dialog.tsx'
import { GlyphMark } from '@/components/GlyphMark.tsx'
import { IconPicker } from '@/components/IconPicker.tsx'
import { glyphOf, type Glyph } from '@/components/glyph.ts'
import { TemplateParamsForm } from '@/app/TemplateParamsForm.tsx'
import { updateTemplate, type TemplateInfo } from '@/lib/api.ts'
import {
  APPLY_FIELDS,
  paramsEqual,
  paramsOf,
  type TemplateParams,
} from '@/stores/generateStore.ts'
import { useEffect, useState } from 'react'

type Pending = { type: 'load' } | { type: 'switch'; id: string } | { type: 'close' }

const ICON_BTN = 'flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-line hover:text-ink'

function SectionTitle({ children }: { children: string }) {
  return <h3 className="border-b border-line pb-1 text-xs font-medium text-ink">{children}</h3>
}

type TemplatePickerProps = {
  items: TemplateInfo[]
  activeId: string
  workflow: string
  selectId?: string | null
  blocked?: boolean
  onSelectHandled?: () => void
  onClose: () => void
  apply: string[]
  onApplyChange: (apply: string[]) => void
  onLoad: (id: string, params: TemplateParams) => void
  onSaveAs: (params: TemplateParams, thenLoad?: boolean) => void
  onRenamed: (id: string, name: string) => void
  onSaved: () => Promise<void> | void
}

export function TemplatePicker({
  items,
  activeId,
  workflow,
  selectId,
  blocked = false,
  onSelectHandled,
  onClose,
  apply,
  onApplyChange,
  onLoad,
  onSaveAs,
  onRenamed,
  onSaved,
}: TemplatePickerProps) {
  const [selectedId, setSelectedId] = useState(activeId)
  const [editor, setEditor] = useState<TemplateParams>(() => {
    const item = items.find((entry) => entry.id === activeId) ?? items[0]
    return item ? paramsOf(item) : paramsOf({ builtin: true })
  })
  const [pending, setPending] = useState<Pending | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rename, setRename] = useState<string | null>(null)
  const selected = items.find((item) => item.id === selectedId) ?? items[0]
  const saved = selected ? paramsOf(selected) : editor
  const locked = Boolean(selected?.builtin)
  const dirty = selected && !locked ? !paramsEqual(editor, saved) : false

  useEffect(() => {
    if (!selectId) {
      return
    }
    const item = items.find((entry) => entry.id === selectId)
    if (!item) {
      return
    }
    setSelectedId(item.id)
    setEditor(paramsOf(item))
    setPending(null)
    setError(null)
    setRename(null)
    onSelectHandled?.()
  }, [selectId])

  useEffect(() => {
    if (blocked) {
      return
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return
      }
      if (rename != null) {
        setRename(null)
        return
      }
      if (pending) {
        setPending(null)
        return
      }
      if (dirty) {
        setPending({ type: 'close' })
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [blocked, pending, dirty, onClose, rename])

  function requestClose() {
    if (dirty) {
      setPending({ type: 'close' })
      return
    }
    onClose()
  }

  function select(id: string) {
    if (id === selectedId) {
      return
    }
    if (dirty) {
      setPending({ type: 'switch', id })
      return
    }
    applySelect(id)
  }

  function applySelect(id: string) {
    const item = items.find((entry) => entry.id === id)
    if (!item) {
      return
    }
    setSelectedId(item.id)
    setEditor(paramsOf(item))
    setPending(null)
    setError(null)
    setRename(null)
  }

  async function saveEditor() {
    if (!selected) {
      return false
    }
    if (selected.builtin) {
      setPending(null)
      onSaveAs(editor)
      return false
    }
    setError(null)
    try {
      await updateTemplate(workflow, selected.id, editor)
      await onSaved()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
      return false
    }
  }

  function loadSaved() {
    onLoad(selectedId, saved)
  }

  async function saveAndLoad() {
    if (!selected) {
      return
    }
    if (selected.builtin) {
      setPending(null)
      onSaveAs(editor, true)
      return
    }
    const ok = await saveEditor()
    if (ok) {
      onLoad(selected.id, editor)
    }
  }

  async function onPendingAccept() {
    if (!pending) {
      return
    }
    if (pending.type === 'switch') {
      applySelect(pending.id)
      return
    }
    if (pending.type === 'close') {
      onClose()
      return
    }
    onLoad(selectedId, saved)
  }

  function toggleApply(id: string) {
    onApplyChange(apply.includes(id) ? apply.filter((item) => item !== id) : [...apply, id])
  }

  async function saveName() {
    if (!selected || locked || rename == null) {
      return
    }
    const next = rename.trim()
    if (!next || next === selected.name) {
      setRename(null)
      return
    }
    if (next.toLowerCase() === 'default') {
      setError('Default is reserved')
      return
    }
    if (items.some((item) => item.id !== selected.id && item.name.toLowerCase() === next.toLowerCase())) {
      setError(`A template named “${next}” already exists`)
      return
    }
    setError(null)
    try {
      await updateTemplate(workflow, selected.id, undefined, next)
      onRenamed(selected.id, next)
      setRename(null)
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rename failed')
    }
  }

  async function saveIcon(icon: Glyph) {
    if (!selected || locked) {
      return
    }
    setError(null)
    try {
      await updateTemplate(workflow, selected.id, undefined, undefined, icon)
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Icon failed')
    }
  }

  return (
    <>
      <Dialog
        onClose={requestClose}
        className="flex h-[min(72vh,38rem)] w-[min(92vw,56rem)] min-w-0 flex-col gap-3"
      >
        <div className="-mx-3 -mt-3 flex items-center gap-2 border-b border-line px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">Templates</span>
          <button type="button" className={ICON_BTN} aria-label="Close" onClick={requestClose}>
            <AppIcon id="x" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 gap-4">
          <aside className="flex w-44 shrink-0 flex-col">
            <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
              {items.map((item, index) => {
                const on = item.id === selectedId
                return (
                  <div key={item.id} className="shrink-0">
                    {index === 1 ? <div className="my-1 border-t border-line" /> : null}
                    <button
                      type="button"
                      className={[
                        'flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm',
                        on ? 'bg-accent text-ink' : 'text-muted hover:bg-line hover:text-ink',
                      ].join(' ')}
                      onClick={() => select(item.id)}
                    >
                      <GlyphMark value={glyphOf(item)} size={16} />
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      {item.id === activeId ? (
                        <span
                          className={[
                            'shrink-0 rounded px-1 py-px text-[10px] font-medium',
                            on ? 'bg-bg text-ink' : 'bg-accent text-ink',
                          ].join(' ')}
                        >
                          current
                        </span>
                      ) : null}
                    </button>
                  </div>
                )
              })}
              <button
                type="button"
                className="flex w-full shrink-0 items-center justify-center rounded px-2 py-1.5 text-sm leading-none text-muted hover:bg-line hover:text-ink"
                aria-label="New template"
                title="New template"
                onClick={() => onSaveAs(editor)}
              >
                +
              </button>
            </div>
          </aside>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex h-7 shrink-0 items-center gap-2">
              <IconPicker value={glyphOf(selected ?? { builtin: true })} disabled={locked} onChange={(icon) => void saveIcon(icon)} />
              {rename != null && !locked ? (
                <form
                  className="flex min-w-0 flex-1 items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    void saveName()
                  }}
                >
                  <input
                    className="min-w-0 flex-1 rounded border border-line bg-field px-2 py-0.5 text-sm font-bold text-ink outline-none focus:border-accent"
                    value={rename}
                    onChange={(e) => setRename(e.target.value)}
                    autoFocus
                  />
                  <button type="submit" className={ICON_BTN} aria-label="Save name" title="Save name">
                    <AppIcon id="pencil" />
                  </button>
                </form>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{selected?.name ?? 'Template'}</span>
                  {locked ? (
                    <span className="shrink-0 rounded bg-accent/25 px-1.5 py-0.5 text-[10px] font-medium text-ink">
                      read-only
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={ICON_BTN}
                      aria-label="Rename template"
                      title="Rename"
                      onClick={() => setRename(selected?.name ?? '')}
                    >
                      <AppIcon id="pencil" />
                    </button>
                  )}
                </>
              )}
            </div>
            <fieldset
              disabled={locked}
              className="min-h-0 min-w-0 flex-1 overflow-y-auto border-0 p-0 pr-3 disabled:opacity-60"
            >
              <TemplateParamsForm value={editor} apply={apply} onChange={locked ? () => undefined : setEditor} />
            </fieldset>
          </div>
          <aside className="flex w-44 shrink-0 flex-col gap-1.5">
            <SectionTitle>Apply</SectionTitle>
            <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
              {APPLY_FIELDS.map((field) => (
                <label
                  key={field.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-ink hover:bg-line"
                >
                  <input
                    type="checkbox"
                    className="check"
                    checked={apply.includes(field.id)}
                    onChange={() => toggleApply(field.id)}
                  />
                  {field.label}
                </label>
              ))}
            </div>
          </aside>
        </div>
        {error ? <p className="-mb-1 text-xs text-accent">{error}</p> : null}
        <div className="flex gap-2">
          <button
            type="button"
            className="flex-1 rounded px-2.5 py-1.5 text-sm text-muted hover:bg-line hover:text-ink"
            onClick={requestClose}
          >
            Cancel
          </button>
          {dirty ? (
            <button
              type="button"
              className="flex-1 rounded px-2.5 py-1.5 text-sm text-muted hover:bg-line hover:text-ink"
              onClick={() => void saveEditor()}
            >
              Save
            </button>
          ) : null}
          <button
            type="button"
            className="flex-1 rounded bg-accent px-2.5 py-1.5 text-sm text-ink"
            onClick={() => (dirty ? setPending({ type: 'load' }) : loadSaved())}
          >
            Load
          </button>
        </div>
      </Dialog>
      {pending && !blocked ? (
        <ConfirmDialog
          title={pending.type === 'load' ? 'Unsaved changes' : 'Discard edits?'}
          body={
            pending.type === 'load'
              ? `Load “${selected?.name ?? 'this template'}” without saving? Your edits to this template will be lost.`
              : pending.type === 'close'
                ? 'Close without saving your template edits?'
                : 'Switch templates without saving your edits?'
          }
          onClose={() => setPending(null)}
          actions={[
            { label: 'Cancel', onClick: () => setPending(null) },
            {
              label: pending.type === 'load' && !selected?.builtin ? 'Save & Load' : 'Save',
              kind: 'primary',
              onClick: () => {
                if (pending.type === 'load') {
                  void saveAndLoad()
                  return
                }
                void saveEditor().then((ok) => {
                  if (!ok) {
                    return
                  }
                  if (pending.type === 'switch') {
                    applySelect(pending.id)
                    return
                  }
                  onClose()
                })
              },
            },
            {
              label: pending.type === 'load' ? 'Load without saving' : "Don't save",
              onClick: () => void onPendingAccept(),
            },
          ]}
        />
      ) : null}
    </>
  )
}
