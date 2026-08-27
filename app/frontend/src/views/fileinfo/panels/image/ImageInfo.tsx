import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { ContextMenu, ContextMenuItem } from '@/components/composites/chrome/ContextMenu.tsx'
import { ExpandSection } from '@/components/controls/expand-section/ExpandSection.tsx'
import { MetaCard } from '@/components/composites/models/MetaCard.tsx'
import type { CivitaiVersion } from '@/lib/api.ts'
import { openInCivitaiPanel } from '@/lib/civitai/openTab.ts'
import { civitaiHost, useSettingsStore } from '@/stores/settingsStore.ts'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { civitaiUrl } from '@/views/fileinfo/panels/civitai/CivitaiLayouts.tsx'
import { type PngLora } from '@/views/fileinfo/panels/image/sections/parse.ts'

type SavedHashes = {
  autov1?: string
  autov2?: string
  autov3?: string
  sha256?: string
}

type SavedModel = {
  kind: string
  hashes?: SavedHashes
  strength?: number
}

type SavedParams = {
  prompt?: string
  negative_prompt?: string
  prompt_raw?: string
  negative_prompt_raw?: string
  steps?: number
  cfg?: number
  seed?: number
  sampler?: string
  scheduler?: string
  width?: number
  height?: number
  interrupted?: boolean
  models?: SavedModel[]
}

type BlomboMeta = {
  version?: number
  params?: SavedParams
}

type ImageInfoProps = {
  text: string
  raw: Record<string, string>
  metadata?: Record<string, unknown> | null
  busy: boolean
  civitai?: CivitaiVersion | null
  loraCivitai?: Record<string, CivitaiVersion | null>
}

function isV2(meta: Record<string, unknown> | null | undefined): meta is BlomboMeta & { version: 2; params: SavedParams } {
  if (!meta || meta.version !== 2 || !meta.params || typeof meta.params !== 'object') {
    return false
  }
  const params = meta.params as SavedParams
  return Array.isArray(params.models) && typeof params.prompt === 'string' && typeof params.prompt_raw === 'string'
}

function pretty(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

function CopyCard({
  title,
  value,
  className = '',
  mono = false,
}: {
  title: string
  value: string
  className?: string
  mono?: boolean
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      return
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className="relative">
      <MetaCard title={title} className={[className, 'pr-8'].filter(Boolean).join(' ')} mono={mono}>
        {value}
      </MetaCard>
      <button
        type="button"
        className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded bg-bg/80 text-muted hover:text-ink"
        aria-label={copied ? 'Copied' : `Copy ${title}`}
        title={copied ? 'Copied' : 'Copy'}
        onClick={() => void copy()}
      >
        {copied ? <AppIcon id="check" /> : <AppIcon id="copy" />}
      </button>
    </div>
  )
}

type MetaRow = { label: string; value: string; version?: CivitaiVersion }

function CivitaiMetaLink({ info, children, className }: { info: CivitaiVersion; children: ReactNode; className?: string }) {
  const navigate = useNavigate()
  const site = useSettingsStore((s) => s.civitaiSite)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const href = civitaiUrl(civitaiHost(site), info)
  if (!href) {
    return <span className={className}>{children}</span>
  }
  return (
    <>
      <button
        type="button"
        className={['text-left text-purple-bright hover:underline', className].filter(Boolean).join(' ')}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          setMenu({ x: box.left, y: box.bottom + 4 })
        }}
      >
        {children}
      </button>
      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <ContextMenuItem
            label="Local"
            icon="square-arrow-out-up-right"
            onClick={() => {
              setMenu(null)
              openInCivitaiPanel({ id: info.modelId, name: info.model?.name || 'CivitAI model' }, info.id)
              navigate('/models')
            }}
          />
          <ContextMenuItem
            label="Website"
            icon="external-link"
            onClick={() => {
              setMenu(null)
              window.open(href, '_blank', 'noreferrer')
            }}
          />
        </ContextMenu>
      ) : null}
    </>
  )
}

function loraBits(item: PngLora) {
  const bits: ReactNode[] = []
  bits.push(item.name)
  if (item.strength != null && item.strength !== 1) {
    bits.push(String(item.strength))
  }
  if (item.hash) {
    bits.push(item.hash)
  }
  return bits
}

export function GenMetaPanel({
  prompt,
  promptRaw,
  negative,
  negativeRaw,
  rows,
  loras,
  loraCivitai,
}: {
  prompt?: string
  promptRaw?: string
  negative?: string
  negativeRaw?: string
  rows: MetaRow[]
  loras?: PngLora[]
  loraCivitai?: Record<string, CivitaiVersion | null>
}) {
  const list = loras || []
  if (!prompt && !promptRaw && !negative && !negativeRaw && !rows.length && !list.length) {
    return null
  }
  return (
    <div className="flex min-w-0 flex-col gap-2 text-xs">
      {prompt ? (
        <CopyCard title="Prompt" value={prompt} className="bg-field" mono />
      ) : null}
      {promptRaw && promptRaw !== prompt ? (
        <CopyCard title="Prompt (raw)" value={promptRaw} className="bg-field" mono />
      ) : null}
      {negative ? <CopyCard title="Negative" value={negative} /> : null}
      {negativeRaw && negativeRaw !== negative ? <CopyCard title="Negative (raw)" value={negativeRaw} /> : null}
      {rows.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {rows.map((row) => (
            <MetaCard key={row.label} title={row.label}>
              {row.version ? (
                <CivitaiMetaLink info={row.version} className="break-all">
                  {row.value}
                </CivitaiMetaLink>
              ) : (
                <span className="break-all">{row.value}</span>
              )}
            </MetaCard>
          ))}
        </div>
      ) : null}
      {list.length ? (
        <MetaCard title="LoRA" mono>
          {list.map((item) => {
            const hit = item.hash ? loraCivitai?.[item.hash] : null
            const bits = loraBits(item)
            return (
              <p key={`${item.name}:${item.hash || ''}`}>
                {bits.map((bit, i) => (
                  <span key={i}>
                    {i > 0 ? ' · ' : null}
                    {i === 0 && hit ? <CivitaiMetaLink info={hit}>{bit}</CivitaiMetaLink> : bit}
                  </span>
                ))}
              </p>
            )
          })}
        </MetaCard>
      ) : null}
    </div>
  )
}

function hashOf(row?: SavedHashes) {
  return row?.autov2 || row?.sha256 || row?.autov3 || row?.autov1 || ''
}

function hitFor(hashes: SavedHashes | undefined, hits: Record<string, CivitaiVersion | null>) {
  for (const key of ['autov2', 'sha256', 'autov3', 'autov1'] as const) {
    const digest = hashes?.[key]?.toLowerCase()
    if (digest && hits[digest]) {
      return hits[digest]
    }
  }
  return null
}

function v2Rows(
  params: SavedParams,
  civitai: CivitaiVersion | null,
  hits: Record<string, CivitaiVersion | null>,
): MetaRow[] {
  const ckpt = (params.models || []).find((item) => item.kind === 'checkpoints' || item.kind === 'diffusion_models' || item.kind === 'checkpoint')
  const ckptHash = hashOf(ckpt?.hashes)
  const modelName = civitai?.model?.name || ckptHash
  const rows: MetaRow[] = [
    { label: 'Steps', value: params.steps != null ? String(params.steps) : '' },
    { label: 'Sampler', value: params.sampler || '' },
    { label: 'Scheduler', value: params.scheduler || '' },
    { label: 'CFG', value: params.cfg != null ? String(params.cfg) : '' },
    { label: 'Seed', value: params.seed != null ? String(params.seed) : '' },
    {
      label: 'Size',
      value: params.width != null && params.height != null ? `${params.width}x${params.height}` : '',
    },
    { label: 'Model', value: modelName, version: civitai || undefined },
    { label: 'Model hash', value: ckptHash },
    { label: 'Interrupted', value: params.interrupted ? 'True' : '' },
    { label: 'AutoV1', value: ckpt?.hashes?.autov1 || '' },
    { label: 'AutoV3', value: ckpt?.hashes?.autov3 || '' },
    { label: 'SHA256', value: ckpt?.hashes?.sha256 || '' },
  ]
  const labels: Record<string, string> = {
    vae: 'VAE',
    text_encoders: 'Text encoder',
    upscale_models: 'Upscale',
    controlnet: 'ControlNet',
  }
  for (const item of params.models || []) {
    const label = labels[item.kind]
    if (!label) {
      continue
    }
    const digest = hashOf(item.hashes)
    const hit = hitFor(item.hashes, hits)
    rows.push({ label, value: hit?.model?.name || digest, version: hit || undefined })
  }
  return rows.filter((row) => row.value)
}

function v2Loras(params: SavedParams, hits: Record<string, CivitaiVersion | null>): PngLora[] {
  return (params.models || [])
    .filter((item) => item.kind === 'loras')
    .map((item) => {
      const hash = hashOf(item.hashes)
      const hit = hitFor(item.hashes, hits)
      return { name: hit?.model?.name || hash, hash: hash.toLowerCase(), strength: item.strength }
    })
}

function RawSwitch({ mode, onMode }: { mode: 'json' | 'formatted'; onMode: (mode: 'json' | 'formatted') => void }) {
  return (
    <div className="inline-flex h-8 shrink-0 rounded border border-line text-xs">
      <button
        type="button"
        className={['h-full rounded-l px-2', mode === 'formatted' ? 'bg-line text-ink' : 'text-muted hover:text-ink'].join(' ')}
        disabled={mode === 'formatted'}
        onClick={() => onMode('formatted')}
      >
        Formatted
      </button>
      <button
        type="button"
        className={['h-full rounded-r px-2', mode === 'json' ? 'bg-line text-ink' : 'text-muted hover:text-ink'].join(' ')}
        disabled={mode === 'json'}
        onClick={() => onMode('json')}
      >
        JSON
      </button>
    </div>
  )
}

export function ImageInfo({ text, raw, metadata, busy, civitai, loraCivitai }: ImageInfoProps) {
  const [rawMode, setRawMode] = useState<'json' | 'formatted'>('formatted')
  if (busy) {
    return <p className="text-sm text-muted">Reading…</p>
  }
  if (!text && !Object.keys(raw).length) {
    return <p className="text-sm text-muted">Drop an image or .safetensors file</p>
  }
  const blob = isV2(metadata) ? metadata : null
  const hits = loraCivitai || {}
  const rows = blob ? v2Rows(blob.params, civitai || null, hits) : []
  const loras = blob ? v2Loras(blob.params, hits) : []
  const prompt = blob ? blob.params.prompt || '' : ''
  const promptRaw = blob ? blob.params.prompt_raw || '' : ''
  const negative = blob ? blob.params.negative_prompt || '' : ''
  const negativeRaw = blob ? blob.params.negative_prompt_raw || '' : ''
  const rawKeys = Object.keys(raw).sort((a, b) => Number(a === 'prompt') - Number(b === 'prompt'))
  const jsonText = blob ? JSON.stringify(blob, null, 2) : ''

  return (
    <div className="flex flex-col gap-3">
      {blob ? (
        <GenMetaPanel
          prompt={prompt}
          promptRaw={promptRaw}
          negative={negative}
          negativeRaw={negativeRaw}
          rows={rows}
          loras={loras}
          loraCivitai={hits}
        />
      ) : null}
      {rawKeys.length ? (
        <ExpandSection title="Raw metadata" defaultOpen trailing={<RawSwitch mode={rawMode} onMode={setRawMode} />}>
          {rawMode === 'json' ? (
            jsonText ? (
              <pre className="whitespace-pre-wrap break-words font-mono text-xs text-ink">{jsonText}</pre>
            ) : (
              <p className="text-xs text-muted">No JSON metadata</p>
            )
          ) : (
            <div className="flex flex-col gap-3">
              {rawKeys.map((key) => (
                <div key={key} className="flex flex-col gap-1">
                  {key === 'prompt' ? null : <span className="text-xs text-muted">{key}</span>}
                  <pre className="whitespace-pre-wrap break-words font-mono text-xs text-ink">{pretty(raw[key])}</pre>
                </div>
              ))}
            </div>
          )}
        </ExpandSection>
      ) : null}
    </div>
  )
}
