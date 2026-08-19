import { Chevron } from '@/components/Chevron.tsx'
import { CloseIcon } from '@/components/CloseIcon.tsx'
import { ConfirmDialog, Dialog } from '@/components/Dialog.tsx'
import { DownloadIcon } from '@/components/DownloadIcon.tsx'
import { InfoIcon } from '@/components/InfoIcon.tsx'
import { ChipSelect } from '@/components/ChipSelect.tsx'
import { TilePreview } from '@/components/TilePreview.tsx'
import {
  fetchCivitaiImage,
  getModelInfo,
  modelThumbUrl,
  saveModelInfo,
  saveModelThumb,
  deleteModelThumb,
  type CivitaiVersion,
  type ModelEntry,
  type ModelLists,
} from '@/lib/api.ts'
import { civitaiPreviewUrl, lookupCivitai } from '@/lib/civitaiFill.ts'
import { filterTypeSections, matchModelType, MODEL_TYPE_SECTIONS } from '@/lib/modelTypes.ts'
import { useGenerateStore } from '@/stores/generateStore.ts'
import { modelLabel, useModelsStore } from '@/stores/modelsStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

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

function Area({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-0.5">
      <span className="text-xs text-muted">{label}</span>
      <textarea
        className="min-h-16 w-full resize-y rounded border border-line bg-bg px-2 py-1 font-mono text-sm text-ink outline-none focus:border-accent"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
      />
    </div>
  )
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
  const navigate = useNavigate()
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
  const [posPrompt, setPosPrompt] = useState('')
  const [savedPos, setSavedPos] = useState('')
  const setMeta = useModelsStore((s) => s.setMeta)
  const lora = kind === 'loras'
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
  const [pulling, setPulling] = useState(false)
  const [confirmFill, setConfirmFill] = useState<CivitaiVersion | null>(null)
  const dirty =
    types.join('\0') !== savedTypes.join('\0') || pending != null || (lora && posPrompt !== savedPos)

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
        setPosPrompt(info.prompt ?? '')
        setSavedPos(info.prompt ?? '')
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
      if (confirmFill) {
        setConfirmFill(null)
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, previewOpen, confirmFill])

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
      const next = await saveModelInfo(
        kind,
        item.path,
        types,
        lora ? { prompt: posPrompt } : undefined,
      )
      setTypes(next)
      setSavedTypes(next)
      if (lora) {
        const pos = posPrompt.trim()
        setPosPrompt(pos)
        setSavedPos(pos)
        setMeta(kind, item.path, { prompt: pos })
      }
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

  function hasLocalData() {
    const hasThumb = pending === 'clear' ? false : Boolean(pending || thumb)
    return types.length > 0 || hasThumb || (lora && Boolean(posPrompt.trim()))
  }

  async function applyCivitai(info: CivitaiVersion) {
    const type = matchModelType(info.baseModel || '')
    if (type) {
      setTypes([type])
    }
    if (lora) {
      const words = (info.trainedWords || []).map((word) => word.trim()).filter(Boolean)
      if (words.length) {
        setPosPrompt(words.join(', '))
      }
    }
    const url = civitaiPreviewUrl(info)
    if (!url) {
      return
    }
    const file = await fetchCivitaiImage(url)
    pickPreview(file)
  }

  async function fromCivitai() {
    if (pulling || kind === 'wildcards') {
      return
    }
    const found = [hashes.autov3, hashes.autov2, hashes.autov1, hashes.sha256].filter(Boolean)
    if (!found.length) {
      return
    }
    setPulling(true)
    try {
      const hit = await lookupCivitai(found)
      if (!hit) {
        return
      }
      if (hasLocalData()) {
        setConfirmFill(hit)
        return
      }
      await applyCivitai(hit)
    } catch {
      /* keep current fields */
    } finally {
      setPulling(false)
    }
  }

  const canDownload = kind !== 'wildcards' && Boolean(hashes.autov3 || hashes.autov2 || hashes.autov1 || hashes.sha256)

  return (
    <Dialog onClose={onClose} className="flex w-[min(92vw,48rem)] min-w-0 flex-col gap-3">
      <div className="-mx-3 -mt-3 flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{modelLabel(fileName(item.path))}</span>
        {kind !== 'wildcards' ? (
          <>
            <button
              type="button"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-line hover:text-ink"
              aria-label="File info"
              title="File info"
              onClick={() => {
                navigate('/file-info', { state: { kind, path: item.path, thumb: thumb || 0 } })
                onClose()
              }}
            >
              <InfoIcon />
            </button>
            <button
              type="button"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-line hover:text-ink disabled:opacity-40"
              aria-label="Download from Civitai"
              title="Download from Civitai"
              disabled={!canDownload || pulling}
              onClick={() => void fromCivitai()}
            >
              <DownloadIcon />
            </button>
          </>
        ) : null}
        <button
          type="button"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-line hover:text-ink"
          aria-label="Close"
          onClick={onClose}
        >
          <CloseIcon />
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
          {kind !== 'wildcards' ? (
            <Section title="Hashes">
              <Field label="SHA256" value={hashValue(hashes.sha256, hashing)} />
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
                <Field label="AutoV1" value={hashValue(hashes.autov1, hashing)} />
                <Field label="AutoV2" value={hashValue(hashes.autov2, hashing)} />
                <Field label="AutoV3" value={hashValue(hashes.autov3, hashing)} />
              </div>
            </Section>
          ) : null}
          <Section title="Model Type">
            <ChipSelect options={pickerOptions} value={types} onChange={setTypes} placeholder="Assign types…" />
            {lora ? <Area label="Trigger words" value={posPrompt} onChange={setPosPrompt} /> : null}
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
      {confirmFill ? (
        <ConfirmDialog
          title="Replace existing data?"
          body={
            lora
              ? 'Thumbnail, model type, or trigger words are already set. Download from Civitai anyway?'
              : 'Thumbnail or model type is already set. Download from Civitai anyway?'
          }
          onClose={() => setConfirmFill(null)}
          actions={[
            { label: 'Cancel', onClick: () => setConfirmFill(null) },
            {
              label: 'Replace',
              kind: 'primary',
              onClick: () => {
                const hit = confirmFill
                setConfirmFill(null)
                setPulling(true)
                void applyCivitai(hit).finally(() => setPulling(false))
              },
            },
          ]}
        />
      ) : null}
    </Dialog>
  )
}
