import { ConfirmDialog, Dialog } from '@/components/primitives/Dialog.tsx'
import { ModelInfoActions, ModelInfoBody, ModelInfoHeader } from '@/components/models/ModelInfoLayouts.tsx'
import { TilePreview } from '@/components/models/TilePreview.tsx'
import { clampLora, loraRange, modelFileName } from '@/components/models/modelInfoLayouts.ts'
import { otherKindLabel } from '@/components/gallery/galleryUtils.ts'
import {
  fetchCivitaiImage,
  getModelInfo,
  saveModelInfo,
  saveModelThumb,
  deleteModelThumb,
  type CivitaiVersion,
  type ModelEntry,
  type ModelLists,
  type ThumbMeta,
} from '@/lib/api.ts'
import { civitaiPreviewUrl, civitaiThumbMeta, lookupCivitai } from '@/lib/civitai/fill.ts'
import { civitaiSaveThumbView, modelThumbSrc, saveThumbView } from '@/lib/gallery/thumbView.ts'
import { filterTypeSections, matchModelType, MODEL_TYPE_SECTIONS } from '@/lib/modelTypes.ts'
import { useGenerateStore } from '@/stores/generateStore.ts'
import { modelLabel, useModelsStore } from '@/stores/modelsStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useThumbView } from '@/stores/thumbnailScopeStore.ts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export function ModelInfoDialog({
  kind,
  item,
  onClose,
  onSaved,
  scopeKey,
}: {
  kind: keyof ModelLists
  item: ModelEntry
  onClose: () => void
  onSaved?: (thumb: number) => void
  scopeKey?: string
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
  const [notes, setNotes] = useState('')
  const [savedNotes, setSavedNotes] = useState('')
  const [strength, setStrength] = useState(1)
  const [savedStrength, setSavedStrength] = useState(1)
  const [slider, setSlider] = useState(false)
  const [savedSlider, setSavedSlider] = useState(false)
  const [autoApplyOverride, setAutoApplyOverride] = useState<boolean | null>(null)
  const [savedAutoApplyOverride, setSavedAutoApplyOverride] = useState<boolean | null>(null)
  const [applyAtOverride, setApplyAtOverride] = useState<'start' | 'end' | null>(null)
  const [savedApplyAtOverride, setSavedApplyAtOverride] = useState<'start' | 'end' | null>(null)
  const setMeta = useModelsStore((s) => s.setMeta)
  const lora = kind === 'loras'
  const hiddenModelTypes = useSettingsStore((s) => s.hiddenModelTypes) ?? []
  const strengthMin = useSettingsStore((s) => s.loraStrengthMin)
  const strengthMax = useSettingsStore((s) => s.loraStrengthMax)
  const sliderMin = useSettingsStore((s) => s.loraSliderMin)
  const sliderMax = useSettingsStore((s) => s.loraSliderMax)
  const loraAutoApplyDefault = useSettingsStore((s) => s.loraAutoApply)
  const loraApplyAtDefault = useSettingsStore((s) => s.loraApplyAt)
  const view = useThumbView(kind, scopeKey)
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
  const [pendingMeta, setPendingMeta] = useState<ThumbMeta>({ origin: 'modelinfo' })
  const [saving, setSaving] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [confirmFill, setConfirmFill] = useState<CivitaiVersion | null>(null)
  const dirty =
    types.join('\0') !== savedTypes.join('\0') ||
    pending != null ||
    notes !== savedNotes ||
    (lora &&
      (posPrompt !== savedPos ||
        strength !== savedStrength ||
        slider !== savedSlider ||
        autoApplyOverride !== savedAutoApplyOverride ||
        applyAtOverride !== savedApplyAtOverride))

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
        setNotes(info.notes ?? '')
        setSavedNotes(info.notes ?? '')
        const sliderOn = Boolean(info.slider)
        const settings = useSettingsStore.getState()
        const range = sliderOn
          ? loraRange(settings.loraSliderMin, settings.loraSliderMax)
          : loraRange(settings.loraStrengthMin, settings.loraStrengthMax)
        const next = clampLora(info.strength ?? 1, range[0], range[1])
        setSlider(sliderOn)
        setSavedSlider(sliderOn)
        setStrength(next)
        setSavedStrength(next)
        const savedAutoApply = info.auto_apply ?? null
        const savedApplyAt = info.apply_at ?? null
        setAutoApplyOverride(savedAutoApply)
        setSavedAutoApplyOverride(savedAutoApply)
        setApplyAtOverride(savedApplyAt)
        setSavedApplyAtOverride(savedApplyAt)
        setThumb(info.thumb || 0)
      }
      if (info.hashing) {
        timer = window.setTimeout(pull, 500)
      }
    }

    function pull() {
      void getModelInfo(kind, item.path, view)
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
  }, [kind, item.path, view])

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

  function pickPreview(file: File | null, meta: ThumbMeta = { origin: 'modelinfo' }) {
    setPendingUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current)
      }
      return file ? URL.createObjectURL(file) : null
    })
    setPending(file)
    setPendingMeta(meta)
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
    pickPreview(new File([blob], `preview.${ext}`, { type: blob.type || 'image/png' }), { origin: 'generation' })
  }

  function save() {
    if (saving || !dirty) {
      return
    }
    setSaving(true)
    void (async () => {
      const pos = posPrompt.trim()
      const text = notes.trim()
      const next = await saveModelInfo(kind, item.path, types, {
        notes: text,
        ...(lora
          ? {
              prompt: pos,
              strength,
              slider,
              auto_apply: autoApplyOverride,
              apply_at: applyAtOverride,
            }
          : {}),
      })
      const nextTypes = next.types ?? []
      setTypes(nextTypes)
      setSavedTypes(nextTypes)
      setNotes(text)
      setSavedNotes(text)
      if (lora) {
        setPosPrompt(pos)
        setSavedPos(pos)
        setSavedStrength(strength)
        setSavedSlider(slider)
        setAutoApplyOverride(next.auto_apply ?? null)
        setSavedAutoApplyOverride(next.auto_apply ?? null)
        setApplyAtOverride(next.apply_at ?? null)
        setSavedApplyAtOverride(next.apply_at ?? null)
      }
      setMeta(kind, item.path, {
        notes: text,
        ...(lora
          ? {
              prompt: pos,
              strength,
              slider,
              auto_apply: next.auto_apply ?? null,
              apply_at: next.apply_at ?? null,
            }
          : {}),
      })
      if (pending === 'clear') {
        const tick = await deleteModelThumb(kind, item.path, saveThumbView())
        setThumb(tick)
        setPending(null)
        setEdited(Math.floor(Date.now() / 1000))
        await useModelsStore.getState().pull()
        onSaved?.(tick)
      } else if (pending) {
        const dest = pendingMeta.origin === 'civitai' ? civitaiSaveThumbView() : saveThumbView()
        const tick = await saveModelThumb(kind, item.path, pending, dest, pendingMeta)
        setThumb(tick)
        pickPreview(null)
        setEdited(Math.floor(Date.now() / 1000))
        await useModelsStore.getState().pull()
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
    return (
      types.length > 0 ||
      hasThumb ||
      Boolean(notes.trim()) ||
      (lora && (Boolean(posPrompt.trim()) || autoApplyOverride !== null || applyAtOverride !== null))
    )
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
    pickPreview(file, civitaiThumbMeta(info))
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
    <Dialog onClose={onClose} className="flex w-[min(92vw,42rem)] min-w-0 flex-col gap-3">
      <ModelInfoHeader
        title={modelLabel(modelFileName(item.path))}
        showCivitai={kind !== 'wildcards'}
        canDownload={canDownload}
        pulling={pulling}
        onFileInfo={() => {
          navigate('/file-info', { state: { kind, path: item.path, thumb: thumb || 0 } })
          onClose()
        }}
        onCivitai={() => void fromCivitai()}
        onClose={onClose}
      />
      <ModelInfoBody
        path={item.path}
        size={size}
        edited={edited}
        hashes={hashes}
        hashing={hashing}
        showHashes={kind !== 'wildcards'}
        types={types}
        onTypes={setTypes}
        pickerOptions={pickerOptions}
        notes={notes}
        onNotes={setNotes}
        lora={lora}
        prompt={posPrompt}
        onPrompt={setPosPrompt}
        strength={strength}
        onStrength={setStrength}
        slider={slider}
        onSlider={setSlider}
        strengthMin={strengthMin}
        strengthMax={strengthMax}
        sliderMin={sliderMin}
        sliderMax={sliderMax}
        autoApply={autoApplyOverride ?? loraAutoApplyDefault}
        autoApplyOverride={autoApplyOverride}
        onAutoApply={setAutoApplyOverride}
        onAutoApplyInherit={() => setAutoApplyOverride(null)}
        applyAt={applyAtOverride ?? loraApplyAtDefault}
        applyAtOverride={applyAtOverride}
        onApplyAt={(value) => setApplyAtOverride(value)}
        onApplyAtInherit={() => setApplyAtOverride(null)}
        fileKind={otherKindLabel(kind) || undefined}
        preview={
          <TilePreview
            className="h-full w-full"
            eager
            src={pending === 'clear' ? null : pendingUrl || modelThumbSrc(kind, { ...item, thumb }, view)}
            rawSrc={pending === 'clear' || pendingUrl ? null : modelThumbSrc(kind, { ...item, thumb }, { ...view, raw: true })}
            media={pending && pending !== 'clear' ? pending.type : item.thumb_media}
          />
        }
      />
      <ModelInfoActions
        menuRef={previewMenu}
        pickerRef={picker}
        previewOpen={previewOpen}
        onTogglePreview={() => setPreviewOpen((open) => !open)}
        viewedImageUrl={viewedImageUrl || ''}
        onFromGeneration={() => {
          setPreviewOpen(false)
          void pickFromGeneration()
        }}
        onFromFile={() => {
          setPreviewOpen(false)
          picker.current?.click()
        }}
        canClear={pending !== 'clear' && Boolean(pending || thumb)}
        onClear={() => {
          setPreviewOpen(false)
          clearPreview()
        }}
        onPickFile={pickPreview}
        dirty={dirty}
        saving={saving}
        onCancel={onClose}
        onSave={save}
      />
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
