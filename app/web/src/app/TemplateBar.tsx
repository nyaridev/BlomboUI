import { Chevron } from '@/components/Chevron.tsx'
import { ConfirmDialog, Dialog } from '@/components/Dialog.tsx'
import { GlyphMark } from '@/components/GlyphMark.tsx'
import { glyphOf } from '@/components/glyph.ts'
import { TemplatePicker } from '@/app/TemplatePicker.tsx'
import { createTemplate, getTemplates, setTemplateApply, updateTemplate, type TemplateInfo } from '@/lib/api.ts'
import {
  DEFAULT_APPLY,
  applyOf,
  mixParams,
  paramsEqualApply,
  paramsOf,
  pickParams,
  useGenerateStore,
  type TemplateParams,
} from '@/stores/generateStore.ts'
import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

function SaveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M2.5 2.5h7.2L11.5 4.3V11.5H2.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M4.5 2.5v3h5v-3M4.5 11.5v-4h5v4" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function RestoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M11.2 7A4.2 4.2 0 1 1 7 2.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M7 1.2 8.8 2.8 7 4.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

type CreateState = {
  params: TemplateParams
  mode: 'current' | 'picker' | 'load'
}

export function TemplateBar() {
  const workflow = useGenerateStore((s) => s.workflow)
  const templateId = useGenerateStore((s) => s.templateId) || 'default'
  const setTemplateId = useGenerateStore((s) => s.setTemplateId)
  const applyParams = useGenerateStore((s) => s.applyParams)
  const live = useGenerateStore(useShallow((s) => pickParams(s)))

  const [items, setItems] = useState<TemplateInfo[]>([{ id: 'default', name: 'Default', builtin: true }])
  const [apply, setApply] = useState<string[]>([...DEFAULT_APPLY])
  const [open, setOpen] = useState(false)
  const [restore, setRestore] = useState(false)
  const [create, setCreate] = useState<CreateState | null>(null)
  const [selectId, setSelectId] = useState<string | null>(null)

  const active = items.find((item) => item.id === templateId) ?? items[0]
  const dirty = active ? !paramsEqualApply(live, paramsOf(active), apply) : false

  async function refresh() {
    const pack = await getTemplates(workflow)
    setItems(pack.templates)
    setApply(applyOf(pack.apply))
    if (!pack.templates.some((item) => item.id === templateId)) {
      setTemplateId('default')
    }
    return pack.templates
  }

  useEffect(() => {
    void refresh().catch(() => {
      setItems([{ id: 'default', name: 'Default', builtin: true }])
      setApply([...DEFAULT_APPLY])
    })
  }, [workflow])

  useEffect(() => {
    if (!create && !restore) {
      return
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return
      }
      if (restore) {
        setRestore(false)
        return
      }
      setCreate(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [create, restore])

  async function onCreate(name: string) {
    if (!create) {
      return
    }
    const item = await createTemplate(workflow, name, create.params)
    await refresh()
    setSelectId(item.id)
    if (create.mode !== 'picker') {
      setTemplateId(item.id)
      applyParams(mixParams(pickParams(useGenerateStore.getState()), create.params, apply))
    }
    if (create.mode === 'load') {
      setOpen(false)
    }
    setCreate(null)
  }

  async function saveCurrent() {
    const params = pickParams(useGenerateStore.getState())
    if (!active || active.builtin) {
      setCreate({ params, mode: 'current' })
      return
    }
    await updateTemplate(workflow, active.id, params)
    await refresh()
  }

  function restoreCurrent() {
    if (!active) {
      return
    }
    applyParams(mixParams(live, paramsOf(active), apply))
    setRestore(false)
  }

  return (
    <div className="flex items-center rounded border border-line">
      <button
        type="button"
        className="flex items-center gap-1.5 rounded-l px-2 py-1 text-sm text-ink hover:bg-line"
        onClick={() => setOpen(true)}
      >
        <span className="flex items-center text-muted">
          <GlyphMark value={glyphOf(active ?? { builtin: true })} size={16} />
        </span>
        <span className="max-w-[9rem] truncate">{active?.name ?? 'Default'}</span>
        {dirty ? '*' : ''}
        <span className="text-muted">
          <Chevron dir={open ? 'up' : 'down'} />
        </span>
      </button>
      <button
        type="button"
        className="flex h-[1.875rem] w-8 items-center justify-center border-l border-line text-muted hover:bg-line hover:text-ink"
        aria-label="Save template"
        title="Save"
        onClick={() => void saveCurrent()}
      >
        <SaveIcon />
      </button>
      <button
        type="button"
        className="flex h-[1.875rem] w-8 items-center justify-center rounded-r border-l border-line text-muted hover:bg-line hover:text-ink"
        aria-label="Restore template"
        title="Restore"
        onClick={() => setRestore(true)}
      >
        <RestoreIcon />
      </button>
      {open ? (
        <TemplatePicker
          items={items}
          activeId={templateId}
          workflow={workflow}
          selectId={selectId}
          blocked={create != null || restore}
          onSelectHandled={() => setSelectId(null)}
          onClose={() => {
            setOpen(false)
            setSelectId(null)
          }}
          apply={apply}
          onApplyChange={(next) => {
            setApply(next)
            void setTemplateApply(workflow, next)
              .then((saved) => setApply(applyOf(saved)))
              .catch(() => {})
          }}
          onLoad={(id, params) => {
            setTemplateId(id)
            applyParams(mixParams(pickParams(useGenerateStore.getState()), params, apply))
            setOpen(false)
            setSelectId(null)
          }}
          onSaveAs={(params, thenLoad) => setCreate({ params, mode: thenLoad ? 'load' : 'picker' })}
          onRenamed={(id, name) => {
            setItems((current) => current.map((item) => (item.id === id ? { ...item, name } : item)))
          }}
          onSaved={async () => {
            await refresh()
          }}
        />
      ) : null}
      {create ? (
        <CreateTemplateDialog
          taken={items.map((item) => item.name)}
          onClose={() => setCreate(null)}
          onCreate={onCreate}
        />
      ) : null}
      {restore ? (
        <ConfirmDialog
          title="Restore template?"
          body={`Replace the current generate settings with the saved values from “${active?.name ?? 'Default'}”?`}
          onClose={() => setRestore(false)}
          actions={[
            { label: 'Cancel', onClick: () => setRestore(false) },
            { label: 'Accept', kind: 'primary', onClick: restoreCurrent },
          ]}
        />
      ) : null}
    </div>
  )
}

function CreateTemplateDialog({
  taken,
  onClose,
  onCreate,
}: {
  taken: string[]
  onClose: () => void
  onCreate: (name: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const trimmed = name.trim()
  const reserved = trimmed.toLowerCase() === 'default'
  const duplicate = taken.some((item) => item.toLowerCase() === trimmed.toLowerCase())
  const hint = error || (reserved ? 'Default is reserved' : duplicate ? `A template named “${trimmed}” already exists` : null)

  async function submit() {
    if (!trimmed || busy || reserved || duplicate) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onCreate(trimmed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create template')
      setBusy(false)
    }
  }

  return (
    <Dialog onClose={onClose}>
      <p className="text-sm text-ink">Save new template</p>
      <label className="mt-2 flex flex-col gap-1">
        <span className="text-xs text-muted">Name</span>
        <input
          className="w-full rounded border border-line bg-field px-2 py-1.5 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void submit()
            }
          }}
          placeholder="Template name"
          autoFocus
        />
      </label>
      {hint ? <p className="mt-1.5 text-xs text-accent">{hint}</p> : null}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="rounded px-2.5 py-1 text-xs text-muted hover:bg-line hover:text-ink" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="rounded bg-accent px-2.5 py-1 text-xs text-ink disabled:opacity-40"
          disabled={!trimmed || busy || reserved || duplicate}
          onClick={() => void submit()}
        >
          Create
        </button>
      </div>
    </Dialog>
  )
}
