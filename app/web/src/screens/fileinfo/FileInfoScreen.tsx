import {
  fetchCivitaiImage,
  getCivitaiByHash,
  getKSamplerChoices,
  getModelInfo,
  getModelSafetensors,
  getWorkflows,
  readPngInfo,
  saveModelThumb,
  type CivitaiVersion,
  type ModelLists,
} from '@/lib/api.ts'
import { civitaiSaveThumbView } from '@/lib/gallery/thumbView.ts'
import { SAMPLERS, SCHEDULERS } from '@/screens/generate/resolutions.ts'
import { PARAM_KEYS, pickParams, useGenerateStore } from '@/stores/generateStore.ts'
import { useModelsStore } from '@/stores/modelsStore.ts'
import { useEffect, useRef, useState, type DragEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CivitaiSection } from './CivitaiSection.tsx'
import { ImageInfo } from './ImageInfo.tsx'
import { applyPngInfo, parsePngInfo } from './parse.ts'
import { SafetensorsInfo } from './SafetensorsInfo.tsx'
import { embeddedHashes, readSafetensorsMetadata, type SafetensorsMeta } from './safetensors.ts'

function isSafetensors(file: File) {
  return file.name.toLowerCase().endsWith('.safetensors')
}

function isImage(file: File) {
  return file.type.startsWith('image/')
}

function allowed(file: File) {
  return isImage(file) || isSafetensors(file)
}

async function lookupCivitai(hashes: string[]): Promise<CivitaiVersion | null> {
  const seen = new Set<string>()
  for (const hash of hashes) {
    const value = hash.trim().toLowerCase()
    if (!value || seen.has(value)) {
      continue
    }
    seen.add(value)
    const hit = await getCivitaiByHash(value)
    if (hit) {
      return hit
    }
  }
  return null
}

export function FileInfoScreen() {
  const [kind, setKind] = useState<'empty' | 'image' | 'safetensors'>('empty')
  const [text, setText] = useState('')
  const [raw, setRaw] = useState<Record<string, string>>({})
  const [meta, setMeta] = useState<SafetensorsMeta | null>(null)
  const [pngMeta, setPngMeta] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [civitai, setCivitai] = useState<CivitaiVersion | null>(null)
  const [loraCivitai, setLoraCivitai] = useState<Record<string, CivitaiVersion | null>>({})
  const [civitaiStatus, setCivitaiStatus] = useState<'idle' | 'looking' | 'found' | 'none'>('idle')
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [over, setOver] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [library, setLibrary] = useState<{ kind: keyof ModelLists; path: string } | null>(null)
  const [replacing, setReplacing] = useState(false)
  const seq = useRef(0)
  const dragDepth = useRef(0)
  const picker = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const applyParams = useGenerateStore((s) => s.applyParams)
  const setThumb = useModelsStore((s) => s.setThumb)
  const canSend = kind === 'image' && Boolean(text.trim()) && !busy && !sending

  async function loadCivitai(id: number, hashes: string[]) {
    if (!hashes.length) {
      setCivitai(null)
      setCivitaiStatus('none')
      return
    }
    setCivitaiStatus('looking')
    try {
      const hit = await lookupCivitai(hashes)
      if (id !== seq.current) {
        return
      }
      setCivitai(hit)
      setCivitaiStatus(hit ? 'found' : 'none')
    } catch {
      if (id !== seq.current) {
        return
      }
      setCivitaiStatus('none')
    }
  }

  async function loadLoraCivitai(id: number, hashes: string[]) {
    const unique = [...new Set(hashes.map((hash) => hash.trim().toLowerCase()).filter(Boolean))]
    if (!unique.length) {
      setLoraCivitai({})
      return
    }
    const entries = await Promise.all(
      unique.map(async (hash) => {
        try {
          return [hash, await getCivitaiByHash(hash)] as const
        } catch {
          return [hash, null] as const
        }
      }),
    )
    if (id !== seq.current) {
      return
    }
    setLoraCivitai(Object.fromEntries(entries))
  }

  async function libraryHashes(id: number, modelKind: keyof ModelLists, path: string): Promise<string[]> {
    while (id === seq.current) {
      const info = await getModelInfo(modelKind, path)
      const v3 = info.hashes?.autov3 || ''
      const v2 = info.hashes?.autov2 || info.hash || ''
      if (v3 || !info.hashing) {
        return [v3, v2].filter(Boolean)
      }
      await new Promise((resolve) => window.setTimeout(resolve, 400))
    }
    return []
  }

  async function openLibrary(modelKind: keyof ModelLists, path: string) {
    const id = ++seq.current
    setKind('safetensors')
    setText('')
    setRaw({})
    setMeta(null)
    setPngMeta(null)
    setError(null)
    setCivitai(null)
    setLoraCivitai({})
    setPreview(null)
    setLibrary({ kind: modelKind, path })
    setBusy(true)
    setCivitaiStatus('looking')
    try {
      const next = await getModelSafetensors(modelKind, path)
      if (id !== seq.current) {
        return
      }
      setMeta(next)
      const extra = await libraryHashes(id, modelKind, path)
      if (id !== seq.current) {
        return
      }
      await loadCivitai(id, [...embeddedHashes(next), ...extra])
    } catch (err) {
      if (id !== seq.current) {
        return
      }
      setMeta(null)
      setError(err instanceof Error ? err.message : 'Could not read metadata')
      setCivitaiStatus('idle')
    } finally {
      if (id === seq.current) {
        setBusy(false)
      }
    }
  }

  useEffect(() => {
    if (location.pathname !== '/file-info') {
      return
    }
    const incoming = location.state as { kind?: keyof ModelLists; path?: string; thumb?: number } | null
    if (!incoming?.kind || !incoming?.path) {
      return
    }
    void openLibrary(incoming.kind, incoming.path)
  }, [location.pathname, location.key])

  async function onFile(file: File | null) {
    const id = ++seq.current
    if (!file) {
      setKind('empty')
      setText('')
      setRaw({})
      setMeta(null)
      setPngMeta(null)
      setError(null)
      setCivitai(null)
      setLoraCivitai({})
      setCivitaiStatus('idle')
      setBusy(false)
      setPreview(null)
      setLibrary(null)
      return
    }
    setBusy(true)
    setError(null)
    setCivitai(null)
    setLoraCivitai({})
    setCivitaiStatus('idle')
    setLibrary(null)
    setPreview(isImage(file) ? URL.createObjectURL(file) : null)
    if (isSafetensors(file)) {
      setKind('safetensors')
      setText('')
      setRaw({})
      setMeta(null)
      setPngMeta(null)
      try {
        const next = await readSafetensorsMetadata(file)
        if (id !== seq.current) {
          return
        }
        setMeta(next)
        await loadCivitai(id, embeddedHashes(next))
      } catch (err) {
        if (id !== seq.current) {
          return
        }
        setMeta(null)
        setError(err instanceof Error ? err.message : 'Could not read metadata')
        setCivitaiStatus('idle')
      } finally {
        if (id === seq.current) {
          setBusy(false)
        }
      }
      return
    }
    setKind('image')
    setMeta(null)
    setPngMeta(null)
    try {
      const info = await readPngInfo(file)
      if (id !== seq.current) {
        return
      }
      setText(info.text)
      setRaw(info.raw)
      setPngMeta(info.metadata)
      const params = info.metadata.params as { prompt?: string; prompt_raw?: string; models?: { kind?: string; hashes?: Record<string, string> }[] } | undefined
      const models = info.metadata.version === 2 && typeof params?.prompt === 'string' && typeof params?.prompt_raw === 'string' && Array.isArray(params.models) ? params.models : []
      const ckpt = models.find((item) => item.kind === 'checkpoints' || item.kind === 'diffusion_models' || item.kind === 'checkpoint')
      const all = models.flatMap((item) => Object.values(item.hashes || {}).filter(Boolean))
      const ckptHashes = Object.values(ckpt?.hashes || {}).filter(Boolean)
      await Promise.all([loadCivitai(id, ckptHashes), loadLoraCivitai(id, all)])
    } catch (err) {
      if (id !== seq.current) {
        return
      }
      setText(err instanceof Error ? err.message : 'Could not read metadata')
      setRaw({})
      setPngMeta(null)
    } finally {
      if (id === seq.current) {
        setBusy(false)
      }
    }
  }

  async function sendToGenerate() {
    if (!canSend) {
      return
    }
    setSending(true)
    try {
      const parsed = parsePngInfo(text)
      const workflow = useGenerateStore.getState().workflow
      let allowed = new Set<string>(PARAM_KEYS)
      try {
        const items = await getWorkflows()
        const params = items.find((item) => item.id === workflow)?.params
        if (params?.length) {
          allowed = new Set(params)
        }
      } catch {
        /* keep all keys */
      }
      let samplers: string[] = [...SAMPLERS]
      let schedulers: string[] = [...SCHEDULERS]
      try {
        const choices = await getKSamplerChoices()
        if (choices.samplers.length) {
          samplers = choices.samplers
        }
        if (choices.schedulers.length) {
          schedulers = choices.schedulers
        }
      } catch {
        /* use local lists */
      }
      applyParams(applyPngInfo(pickParams(useGenerateStore.getState()), parsed, allowed, { samplers, schedulers }))
      navigate('/')
    } finally {
      setSending(false)
    }
  }

  async function replacePreview(url: string) {
    if (!library || replacing) {
      return
    }
    setReplacing(true)
    try {
      const file = await fetchCivitaiImage(url)
      const parsed = parsePngInfo(text)
      const image = (civitai?.images || []).find((item) => item.url === url)
      const tick = await saveModelThumb(library.kind, library.path, file, civitaiSaveThumbView(), {
        prompt: String(image?.meta?.prompt || parsed.prompt || ''),
        parameters: text,
        raw,
        origin: 'civitai',
        civitai: civitai
          ? { id: civitai.id, modelId: civitai.modelId, name: civitai.name, baseModel: civitai.baseModel, image: url }
          : undefined,
      })
      setThumb(library.kind, library.path, tick)
      await useModelsStore.getState().pull()
      navigate('/', { state: { tab: library.kind === 'loras' ? 'LoRa' : 'Base Model' } })
    } catch {
      /* keep current preview */
    } finally {
      setReplacing(false)
    }
  }

  useEffect(() => {
    if (!preview?.startsWith('blob:')) {
      return
    }
    return () => URL.revokeObjectURL(preview)
  }, [preview])

  function takeFile(file: File | null) {
    if (file && !allowed(file)) {
      return
    }
    void onFile(file)
  }

  function fromList(files: FileList | null) {
    const file = files?.[0]
    if (file) {
      takeFile(file)
    }
  }

  function onDragEnter(event: DragEvent) {
    event.preventDefault()
    dragDepth.current += 1
    setOver(true)
  }

  function onDragOver(event: DragEvent) {
    event.preventDefault()
  }

  function onDragLeave() {
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setOver(false)
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    dragDepth.current = 0
    setOver(false)
    fromList(event.dataTransfer.files)
  }

  const empty = kind === 'empty'

  return (
    <div
      className={[
        'relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-y-auto',
        over ? 'outline outline-2 outline-accent outline-offset-[-2px]' : '',
      ].join(' ')}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input
        ref={picker}
        type="file"
        accept="image/*,.safetensors"
        className="hidden"
        onChange={(event) => {
          fromList(event.target.files)
          event.target.value = ''
        }}
      />
      {empty ? (
        <button
          type="button"
          className="flex min-h-full w-full flex-1 cursor-pointer items-center justify-center px-6"
          onClick={() => picker.current?.click()}
        >
          <p className="text-sm text-muted">Drop an image or .safetensors file, or click to pick</p>
        </button>
      ) : (
        <div className="mx-auto flex w-full min-w-0 max-w-[1200px] flex-col gap-4 overflow-x-clip px-10 py-4">
          <CivitaiSection
            info={civitai}
            status={kind === 'safetensors' ? civitaiStatus : 'idle'}
            preview={kind === 'image' ? preview : null}
            onPick={() => picker.current?.click()}
            onClear={() => void onFile(null)}
            onGenerate={kind === 'image' ? () => void sendToGenerate() : undefined}
            generateDisabled={!canSend}
            sending={sending}
            onReplacePreview={library ? (url) => void replacePreview(url) : undefined}
            replacing={replacing}
          />
          <div className="flex min-w-0 flex-col gap-3">
            {kind === 'safetensors' ? (
              <SafetensorsInfo
                metadata={meta}
                error={error}
                busy={busy}
                civitai={civitai}
                civitaiStatus={civitaiStatus}
              />
            ) : kind === 'image' ? (
              <ImageInfo text={text} raw={raw} metadata={pngMeta} busy={busy} civitai={civitai} loraCivitai={loraCivitai} />
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
