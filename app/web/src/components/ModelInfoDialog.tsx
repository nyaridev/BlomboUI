import { Chevron } from '@/components/Chevron.tsx'
import { ChipSelect } from '@/components/ChipSelect.tsx'
import { Dialog } from '@/components/Dialog.tsx'
import { TilePreview } from '@/components/TilePreview.tsx'
import {
  deleteModelThumb,
  getModelInfo,
  modelThumbUrl,
  saveModelInfo,
  saveModelThumb,
  type ModelEntry,
  type ModelLists,
} from '@/lib/api.ts'
import { filterTypeSections, MODEL_TYPE_SECTIONS } from '@/lib/modelTypes.ts'
import { useGenerateStore } from '@/stores/generateStore.ts'
import { modelLabel } from '@/stores/modelsStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

function formatSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDate(unix: number) {
  if (!unix) {
    return '—'
  }
  return new Date(unix * 1000).toLocaleString(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function fileName(path: string) {
  return path.split(/[\\/]/).pop() || path
}

function hashValue(value: string, hashing: boolean) {
  if (value) {
    return value
  }
  return hashing ? 'Computing…' : '—'
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-0.5">
      <span className="text-xs text-muted">{label}</span>
      <div className="w-full min-w-0 overflow-x-auto rounded border border-line bg-bg px-2 py-1 [scrollbar-width:thin]">
        <div className="w-max font-mono text-sm whitespace-nowrap text-ink">{value}</div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-1.5">
      <h3 className="border-b border-line pb-1 text-xs font-medium text-ink">{title}</h3>
      {children}
    </section>
  )
}

export function ModelInfoDialog({
  kind,
  item,
  onClose,
  onSaved,
}: {
  kind: keyof ModelLists
  item: ModelEntry
  onClose: () => void
  onSaved?: (thumb: number) => void
}) {
  const picker = useRef<HTMLInputElement>(null)
  const previewMenu = useRef<HTMLDivElement>(null)
  const viewedImageUrl = useGenerateStore((s) => s.viewedImageUrl)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [hashes, setHashes] = useState({ sha256: '', autov1: '', autov2: '', autov3: '' })
  const [hashing, setHashing] = useState(true)
  const [size, setSize] = useState(item.size)
  const [edited, setEdited] = useState(item.edited)
  const [types, setTypes] = useState<string[]>([])
  const [savedTypes, setSavedTypes] = useState<string[]>([])
  const hiddenModelTypes = useSettingsStore((s) => s.hiddenModelTypes) ?? []
  const pickerOptions = useMemo(
    () =>
      filterTypeSections(
        MODEL_TYPE_SECTIONS,
        (item) => !hiddenModelTypes.includes(item) || types.includes(item),
      ),
    [hiddenModelTypes, types],
  )
  const [thumb, setThumb] = useState(item.thumb || 0)
  const [pending, setPending] = useState<File | 'clear' | null>(null)
  const [pendingUrl, setPendingUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const dirty = types.join('\0') !== savedTypes.join('\0') || pending != null

  useEffect(() => {
    let alive = true
    let timer = 0
    let typesReady = false

    function apply(info: Awaited<ReturnType<typeof getModelInfo>>) {
      setHashes(info.hashes ?? { sha256: '', autov1: '', autov2: info.hash || '', autov3: '' })
      setHashing(Boolean(info.hashing))
      setSize(info.size)
      setEdited(info.edited)
      if (!typesReady) {
        typesReady = true
        setTypes(info.types ?? [])
        setSavedTypes(info.types ?? [])
        setThumb(info.thumb || 0)
      }
      if (info.hashing) {
        timer = window.setTimeout(pull, 500)
      }
    }

    function pull() {
      void getModelInfo(kind, item.path)
        .then((info) => {
          if (alive) {
            apply(info)
          }
        })
        .catch(() => {
          if (alive) {
            setHashing(false)
          }
        })
    }

    pull()
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [kind, item.path])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return
      }
      if (previewOpen) {
        setPreviewOpen(false)
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, previewOpen])

  useEffect(() => {
    if (!previewOpen) {
      return
    }
    function onDoc(event: MouseEvent) {
      if (!previewMenu.current?.contains(event.target as Node)) {
        setPreviewOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [previewOpen])

  useEffect(() => {
    return () => {
      if (pendingUrl) {
        URL.revokeObjectURL(pendingUrl)
      }
    }
  }, [pendingUrl])

  function pickPreview(file: File | null) {
    setPendingUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current)
      }
      return file ? URL.createObjectURL(file) : null
    })
    setPending(file)
  }

  function clearPreview() {
    pickPreview(null)
    setPending('clear')
  }

  async function pickFromGeneration() {
    if (!viewedImageUrl) {
      return
    }
    const res = await fetch(viewedImageUrl)
    if (!res.ok) {
      return
    }
    const blob = await res.blob()
    const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png'
    pickPreview(new File([blob], `preview.${ext}`, { type: blob.type || 'image/png' }))
  }

  function save() {
    if (saving || !dirty) {
      return
    }
    setSaving(true)
    void (async () => {
      const next = await saveModelInfo(kind, item.path, types)
      setTypes(next)
      setSavedTypes(next)
      if (pending === 'clear') {
        const tick = await deleteModelThumb(kind, item.path)
        setThumb(tick)
        setPending(null)
        setEdited(Math.floor(Date.now() / 1000))
        onSaved?.(tick)
      } else if (pending) {
        const tick = await saveModelThumb(kind, item.path, pending)
        setThumb(tick)
        pickPreview(null)
        setEdited(Math.floor(Date.now() / 1000))
        onSaved?.(tick)
      } else {
        setEdited(Math.floor(Date.now() / 1000))
        onSaved?.(thumb)
      }
      onClose()
    })()
      .catch(() => {})
      .finally(() => setSaving(false))
  }

  return (
    <Dialog onClose={onClose} className="flex w-[min(92vw,48rem)] min-w-0 flex-col gap-3">
      <div className="-mx-3 -mt-3 flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{modelLabel(fileName(item.path))}</span>
        <button
          type="button"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:bg-line hover:text-ink"
          aria-label="Close"
          onClick={onClose}
        >
          <svg width="11" height="11" viewBox="0 0 14 14" aria-hidden="true">
            <path
              d="M3 3 11 11M11 3 3 11"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <div className="flex items-start gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <Section title="File">
            <Field label="Path" value={item.path} />
            <Field label="Filename" value={fileName(item.path)} />
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
              <Field label="Size" value={size ? formatSize(size) : '—'} />
              <Field label="Modified" value={formatDate(edited)} />
            </div>
          </Section>
          <Section title="Hashes">
            <Field label="SHA256" value={hashValue(hashes.sha256, hashing)} />
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
              <Field label="AutoV1" value={hashValue(hashes.autov1, hashing)} />
              <Field label="AutoV2" value={hashValue(hashes.autov2, hashing)} />
              <Field label="AutoV3" value={hashValue(hashes.autov3, hashing)} />
            </div>
          </Section>
          <Section title="Type">
            <ChipSelect options={pickerOptions} value={types} onChange={setTypes} placeholder="Assign types…" />
          </Section>
        </div>
        <TilePreview
          className="w-80 shrink-0"
          src={pending === 'clear' ? null : pendingUrl || (thumb ? modelThumbUrl(kind, item.path, thumb) : null)}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 rounded px-2.5 py-1.5 text-sm text-muted hover:bg-line hover:text-ink"
          onClick={onClose}
        >
          Cancel
        </button>
        <div ref={previewMenu} className="relative flex-1">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1.5 rounded px-2.5 py-1.5 text-sm text-muted hover:bg-line hover:text-ink"
            aria-haspopup="menu"
            aria-expanded={previewOpen}
            onClick={() => setPreviewOpen((open) => !open)}
          >
            Replace Preview
            <Chevron dir={previewOpen ? 'up' : 'down'} />
          </button>
          {previewOpen ? (
            <ul className="select-menu bottom-[calc(100%+0.25rem)] !top-auto">
              <li>
                <button
                  type="button"
                  disabled={!viewedImageUrl}
                  title={viewedImageUrl ? undefined : 'No image on the Generate tab'}
                  className="disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
                  onClick={() => {
                    setPreviewOpen(false)
                    void pickFromGeneration()
                  }}
                >
                  From Generation
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewOpen(false)
                    picker.current?.click()
                  }}
                >
                  From File
                </button>
              </li>
              <li>
                <button
                  type="button"
                  disabled={pending === 'clear' || (!pending && !thumb)}
                  title={pending === 'clear' || (!pending && !thumb) ? 'No preview to clear' : undefined}
                  className="disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
                  onClick={() => {
                    setPreviewOpen(false)
                    clearPreview()
                  }}
                >
                  Clear Preview
                </button>
              </li>
            </ul>
          ) : null}
        </div>
        <input
          ref={picker}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) {
              pickPreview(file)
            }
            event.target.value = ''
          }}
        />
        <button
          type="button"
          className="flex-1 rounded bg-accent px-2.5 py-1.5 text-sm text-ink disabled:opacity-40"
          disabled={!dirty || saving}
          onClick={save}
        >
          Save
        </button>
      </div>
    </Dialog>
  )
}
