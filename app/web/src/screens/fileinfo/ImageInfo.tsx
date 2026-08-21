import { AppIcon } from '@/components/AppIcon.tsx'
import { ExpandSection } from '@/components/ExpandSection.tsx'
import { MetaCard } from '@/components/MetaCard.tsx'
import type { CivitaiVersion } from '@/lib/api.ts'
import { civitaiHost, useSettingsStore } from '@/stores/settingsStore.ts'
import { useState, type ReactNode } from 'react'
import { civitaiUrl, type Host } from './CivitaiLayouts.tsx'
import { parsePngInfo, type PngInfoParams, type PngLora } from './parse.ts'

type ImageInfoProps = {
  text: string
  raw: Record<string, string>
  busy: boolean
  civitai?: CivitaiVersion | null
  loraCivitai?: Record<string, CivitaiVersion | null>
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

type MetaRow = { label: string; value: string; href?: string }

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
  negative,
  rows,
  loras,
  loraCivitai,
  site,
}: {
  prompt?: string
  negative?: string
  rows: MetaRow[]
  loras?: PngLora[]
  loraCivitai?: Record<string, CivitaiVersion | null>
  site?: Host
}) {
  const list = loras || []
  if (!prompt && !negative && !rows.length && !list.length) {
    return null
  }
  const host = site || 'civitai.com'
  return (
    <div className="flex min-w-0 flex-col gap-2 text-xs">
      {prompt ? (
        <CopyCard title="Prompt" value={prompt} className="bg-field" mono />
      ) : null}
      {negative ? <CopyCard title="Negative" value={negative} /> : null}
      {rows.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {rows.map((row) => (
            <MetaCard key={row.label} title={row.label}>
              {row.href ? (
                <a
                  href={row.href}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-purple-bright hover:underline"
                >
                  {row.value}
                </a>
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
            const href = hit ? civitaiUrl(host, hit) : ''
            const bits = loraBits(item)
            return (
              <p key={`${item.name}:${item.hash || ''}`}>
                {bits.map((bit, i) => (
                  <span key={i}>
                    {i > 0 ? ' · ' : null}
                    {i === 0 && href ? (
                      <a href={href} target="_blank" rel="noreferrer" className="text-purple-bright hover:underline">
                        {bit}
                      </a>
                    ) : (
                      bit
                    )}
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

function infoRows(parsed: PngInfoParams, civitai: CivitaiVersion | null, href: string): MetaRow[] {
  const modelName = civitai?.model?.name || parsed.checkpoint || ''
  const rows: MetaRow[] = [
    { label: 'Steps', value: parsed.steps != null ? String(parsed.steps) : '' },
    { label: 'Sampler', value: parsed.sampler || '' },
    { label: 'Scheduler', value: parsed.scheduler || '' },
    { label: 'CFG', value: parsed.cfg != null ? String(parsed.cfg) : '' },
    { label: 'Seed', value: parsed.seed != null ? String(parsed.seed) : '' },
    {
      label: 'Size',
      value: parsed.width != null && parsed.height != null ? `${parsed.width}x${parsed.height}` : '',
    },
    { label: 'Model', value: modelName, href: href || undefined },
    { label: 'Model hash', value: parsed.modelHash || '' },
    { label: 'Batch size', value: parsed.batchSize != null ? String(parsed.batchSize) : '' },
    { label: 'Batch count', value: parsed.batchCount != null ? String(parsed.batchCount) : '' },
    { label: 'Interrupted', value: parsed.interrupted ? 'True' : '' },
    { label: 'AutoV1', value: parsed.autov1 || '' },
    { label: 'AutoV3', value: parsed.autov3 || '' },
    { label: 'SHA256', value: parsed.sha256 || '' },
  ]
  return rows.filter((row) => row.value)
}

export function ImageInfo({ text, raw, busy, civitai, loraCivitai }: ImageInfoProps) {
  const site = useSettingsStore((s) => s.civitaiSite)
  if (busy) {
    return <p className="text-sm text-muted">Reading…</p>
  }
  if (!text && !Object.keys(raw).length) {
    return <p className="text-sm text-muted">Drop an image or .safetensors file</p>
  }
  const parsed = parsePngInfo(text)
  const href = civitai ? civitaiUrl(civitaiHost(site), civitai) : ''
  const rows = infoRows(parsed, civitai || null, href)
  const structured = Boolean(parsed.prompt || parsed.negativePrompt || rows.length || parsed.loras?.length)
  const rawKeys = Object.keys(raw).sort((a, b) => Number(a === 'prompt') - Number(b === 'prompt'))

  return (
    <div className="flex flex-col gap-3">
      <GenMetaPanel
        prompt={parsed.prompt}
        negative={parsed.negativePrompt}
        rows={rows}
        loras={parsed.loras}
        loraCivitai={loraCivitai}
        site={civitaiHost(site)}
      />
      {!structured && text ? (
        <pre className="whitespace-pre-wrap break-words font-mono text-sm text-ink">{text}</pre>
      ) : null}
      {rawKeys.length ? (
        <ExpandSection title="Raw metadata">
          <div className="flex flex-col gap-3">
            {rawKeys.map((key) => (
              <div key={key} className="flex flex-col gap-1">
                {key === 'prompt' ? null : <span className="text-xs text-muted">{key}</span>}
                <pre className="whitespace-pre-wrap break-words font-mono text-xs text-ink">{pretty(raw[key])}</pre>
              </div>
            ))}
          </div>
        </ExpandSection>
      ) : null}
    </div>
  )
}
