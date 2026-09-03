import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { GlyphMark } from '@/components/composites/chrome/GlyphMark.tsx'
import { glyphOf } from '@/components/composites/chrome/glyph.ts'
import { TemplatePicker } from '@/components/composites/templates/TemplatePicker.tsx'
import { ConfirmDialog } from '@/components/controls/dialog/Dialog.tsx'
import { NameDialog } from '@/components/controls/dialog/NameDialog.tsx'
import {
  createTemplate,
  deleteTemplate,
  getTemplates,
  getWorkflows,
  reorderTemplates,
  updateTemplate,
  type TemplateInfo,
} from '@/lib/api.ts'
import {
  changedApplyIds,
  DEFAULT_APPLY,
  diffParams,
  mergeParams,
  mixParams,
  mixStack,
  paramsOf,
  pickParams,
  stackLayers,
  useGenerateStore,
  type TemplateParams,
} from '@/stores/generateStore.ts'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const CHIP =
  'flex h-8 shrink-0 items-center gap-1.5 rounded border border-line bg-field px-2 text-sm text-ink hover:bg-line'

const FALLBACK: TemplateInfo = {
  id: 'default',
  name: 'Default',
  builtin: true,
  apply: [...DEFAULT_APPLY],
  enabled: true,
}

export function TemplateBar() {
  const workflow = useGenerateStore((s) => s.workflow)
  const setTemplateId = useGenerateStore((s) => s.setTemplateId)
  const applyParams = useGenerateStore((s) => s.applyParams)

  const [items, setItems] = useState<TemplateInfo[]>([FALLBACK])
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<{ title: string; next: TemplateParams; templateId: string } | null>(null)
  const [create, setCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null)
  const [renameBusy, setRenameBusy] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [remove, setRemove] = useState<TemplateInfo | null>(null)
  const chipRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const enabledCustoms = items.filter((item) => !item.builtin && item.enabled !== false)
  const chipItem = enabledCustoms[enabledCustoms.length - 1] ?? items.find((item) => item.builtin) ?? FALLBACK
  const chipLabel = enabledCustoms.length ? enabledCustoms.map((item) => item.name).join(', ') : 'Default'
  const taken = items.map((item) => item.name)
  const dialogOpen = create || rename != null || remove != null || pending != null

  async function refresh() {
    const pack = await getTemplates(workflow)
    setItems(pack.templates)
    return pack.templates
  }

  useEffect(() => {
    void refresh().catch(() => setItems([FALLBACK]))
  }, [workflow])

  useEffect(() => {
    if (!open) {
      return
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape' || dialogOpen) {
        return
      }
      setOpen(false)
    }
    function onPointer(event: PointerEvent) {
      if (dialogOpen) {
        return
      }
      const node = event.target as Node | null
      const el = event.target instanceof Element ? event.target : null
      if (chipRef.current?.contains(node) || panelRef.current?.contains(node) || el?.closest('[data-overlay], [role="dialog"]')) {
        return
      }
      setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer, true)
    }
  }, [open, dialogOpen])

  function show() {
    setOpen(true)
  }

  function requestApply(title: string, templateId: string, next: TemplateParams) {
    setPending({ title, next, templateId })
  }

  function applyViewed(id: string, params: ReturnType<typeof paramsOf>, apply: string[]) {
    const live = pickParams(useGenerateStore.getState())
    requestApply('Apply template?', id, mixParams(live, params, apply))
  }

  function applyAll(list: TemplateInfo[]) {
    const live = pickParams(useGenerateStore.getState())
    const last = [...list].reverse().find((item) => item.builtin || item.enabled !== false)
    requestApply('Apply all templates?', last?.id ?? 'default', mixStack(live, stackLayers(list)))
  }

  function acceptApply() {
    if (!pending) {
      return
    }
    setTemplateId(pending.templateId)
    applyParams(pending.next)
    setPending(null)
    setOpen(false)
  }

  async function onCreate(name: string, source: 'empty' | 'current') {
    const workflows = await getWorkflows().catch(() => [])
    const info = workflows.find((item) => item.id === workflow)
    const baseline = info?.defaults != null ? mergeParams(info.defaults) : paramsOf({ builtin: true })
    const live = pickParams(useGenerateStore.getState())
    const params = source === 'empty' ? baseline : live
    const apply = source === 'empty' ? [] : changedApplyIds(baseline, live, info?.params ?? [])
    const item = await createTemplate(workflow, name, params, apply)
    const next = await refresh()
    setItems(next.some((entry) => entry.id === item.id) ? next : [...next, item])
    useGenerateStore.getState().setViewedTemplateId(item.id)
    setCreate(false)
    setCreateName('')
  }

  async function onRenameSubmit(id: string, name: string) {
    const saved = await updateTemplate(workflow, id, undefined, name)
    setItems((current) => current.map((entry) => (entry.id === saved.id ? { ...entry, ...saved } : entry)))
    setRename(null)
  }

  async function onDelete() {
    if (!remove) {
      return
    }
    await deleteTemplate(workflow, remove.id)
    const next = await refresh()
    setItems(next)
    setRemove(null)
  }

  async function onReorder(ids: string[]) {
    try {
      const next = await reorderTemplates(workflow, ids)
      setItems(next)
    } catch {
      /* keep current */
    }
  }

  const createTrimmed = createName.trim()
  const createHint =
    createError ||
    (createTrimmed.toLowerCase() === 'default'
      ? 'Default is reserved'
      : taken.some((name) => name.toLowerCase() === createTrimmed.toLowerCase())
        ? `A template named “${createTrimmed}” already exists`
        : null)
  const renameTrimmed = rename?.name.trim() ?? ''
  const renameHint =
    renameError ||
    (renameTrimmed.toLowerCase() === 'default'
      ? 'Default is reserved'
      : rename && taken.some((name) => name.toLowerCase() === renameTrimmed.toLowerCase() && name !== items.find((item) => item.id === rename.id)?.name)
        ? `A template named “${renameTrimmed}” already exists`
        : null)

  return (
    <div className="relative">
      <button ref={chipRef} type="button" className={CHIP} onClick={() => (open ? setOpen(false) : show())}>
        <span className="flex items-center text-muted">
          <GlyphMark value={glyphOf(chipItem)} size={16} muted />
        </span>
        <span className="max-w-[12rem] truncate">{chipLabel}</span>
        <span className="text-muted">
          <AppIcon id={open ? 'chevron-up' : 'chevron-down'} size={12} />
        </span>
      </button>
      {open
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 p-4">
              <div
                ref={panelRef}
                data-overlay=""
                className="flex h-[min(90vh,56rem)] w-[min(96vw,90rem)] flex-col rounded-md border border-line bg-panel p-3 shadow-[0_8px_24px_rgb(0_0_0_/_0.45)]"
              >
                <TemplatePicker
                items={items}
                workflow={workflow}
                onClose={() => setOpen(false)}
                onItems={setItems}
                onCreate={() => {
                  setCreateName('')
                  setCreateError(null)
                  setCreate(true)
                }}
                onRename={(id) => {
                  const item = items.find((entry) => entry.id === id)
                  if (!item || item.builtin) {
                    return
                  }
                  setRenameError(null)
                  setRename({ id, name: item.name })
                }}
                onDelete={(id) => {
                  const item = items.find((entry) => entry.id === id)
                  if (!item || item.builtin) {
                    return
                  }
                  setRemove(item)
                }}
                onReorder={(ids) => void onReorder(ids)}
                onApply={applyViewed}
                onApplyAll={applyAll}
              />
              </div>
            </div>,
            document.body,
          )
        : null}
      {create ? (
        <NameDialog
          title="New template"
          name={createName}
          issue={createHint}
          busy={createBusy}
          onName={(value) => {
            setCreateName(value)
            setCreateError(null)
          }}
          onClose={() => setCreate(false)}
          actions={[
            { label: 'Cancel', kind: 'ghost', onClick: () => setCreate(false) },
            {
              label: 'Empty',
              kind: 'ghost',
              disabled: !createTrimmed || Boolean(createHint),
              onClick: () => {
                setCreateBusy(true)
                void onCreate(createTrimmed, 'empty')
                  .catch((err) => setCreateError(err instanceof Error ? err.message : 'Could not create template'))
                  .finally(() => setCreateBusy(false))
              },
            },
            {
              label: 'From current',
              kind: 'primary',
              submit: true,
              disabled: !createTrimmed || Boolean(createHint),
              onClick: () => {
                setCreateBusy(true)
                void onCreate(createTrimmed, 'current')
                  .catch((err) => setCreateError(err instanceof Error ? err.message : 'Could not create template'))
                  .finally(() => setCreateBusy(false))
              },
            },
          ]}
        />
      ) : null}
      {rename ? (
        <NameDialog
          title="Rename template"
          name={rename.name}
          issue={renameHint}
          busy={renameBusy}
          onName={(value) => {
            setRename((current) => (current ? { ...current, name: value } : current))
            setRenameError(null)
          }}
          onClose={() => setRename(null)}
          actions={[
            { label: 'Cancel', kind: 'ghost', onClick: () => setRename(null) },
            {
              label: 'Rename',
              kind: 'primary',
              submit: true,
              disabled: !renameTrimmed || Boolean(renameHint),
              onClick: () => {
                setRenameBusy(true)
                void onRenameSubmit(rename.id, renameTrimmed)
                  .catch((err) => setRenameError(err instanceof Error ? err.message : 'Rename failed'))
                  .finally(() => setRenameBusy(false))
              },
            },
          ]}
        />
      ) : null}
      {pending ? (
        <ConfirmDialog
          title={pending.title}
          body={<ApplyDiffList from={pickParams(useGenerateStore.getState())} to={pending.next} />}
          onClose={() => setPending(null)}
          actions={[
            { label: 'Cancel', onClick: () => setPending(null) },
            { label: 'Accept', kind: 'primary', onClick: acceptApply },
          ]}
        />
      ) : null}
      {remove ? (
        <ConfirmDialog
          title="Delete template?"
          body={`Delete “${remove.name}”? This cannot be undone.`}
          onClose={() => setRemove(null)}
          actions={[
            { label: 'Cancel', onClick: () => setRemove(null) },
            {
              label: 'Delete',
              kind: 'primary',
              danger: true,
              onClick: () => void onDelete().catch(() => setRemove(null)),
            },
          ]}
        />
      ) : null}
    </div>
  )
}

function ApplyDiffList({ from, to }: { from: TemplateParams; to: TemplateParams }) {
  const diffs = diffParams(from, to)
  if (!diffs.length) {
    return <p>No generate settings will change.</p>
  }
  return (
    <ul className="max-h-60 overflow-y-auto">
      {diffs.map((item) => (
        <li key={item.id} className="border-b border-line py-1 last:border-b-0">
          <span className="text-ink">{item.label}</span>
          <div className="truncate" title={`${item.from} → ${item.to}`}>
            {item.from} → {item.to}
          </div>
        </li>
      ))}
    </ul>
  )
}
