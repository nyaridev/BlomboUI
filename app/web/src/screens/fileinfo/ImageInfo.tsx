import { ExpandSection } from '@/components/ExpandSection.tsx'
import type { CivitaiVersion } from '@/lib/api.ts'
import { civitaiHost, useSettingsStore } from '@/stores/settingsStore.ts'
import { useState } from 'react'
import { civitaiUrl } from './CivitaiLayouts.tsx'
import { parsePngInfo, type PngInfoParams } from './parse.ts'

type ImageInfoProps = {
  text: string
  raw: Record<string, string>
  busy: boolean
  civitai?: CivitaiVersion | null
}

const SETTINGS: { key: keyof PngInfoParams; label: string }[] = [
  { key: 'checkpoint', label: 'Model' },
  { key: 'sampler', label: 'Sampler' },
  { key: 'scheduler', label: 'Scheduler' },
  { key: 'steps', label: 'Steps' },
  { key: 'cfg', label: 'CFG scale' },
  { key: 'seed', label: 'Seed' },
  { key: 'batchSize', label: 'Batch size' },
  { key: 'batchCount', label: 'Batch count' },
]

function pretty(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
      <rect
        x="4.5"
        y="4.5"
        width="7"
        height="8"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M9.5 4.5V3.5A1 1 0 0 0 8.5 2.5H3.5A1 1 0 0 0 2.5 3.5v7A1 1 0 0 0 3.5 11.5H4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M3 7.5 6 10.5 11 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function CopyBlock({ label, value }: { label: string; value: string }) {
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
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <div className="relative">
        <pre className="whitespace-pre-wrap break-words rounded border border-line bg-field px-2 py-1.5 pr-8 font-mono text-sm text-ink">
          {value}
        </pre>
        <button
          type="button"
          className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded bg-bg/80 text-muted hover:text-ink"
          aria-label={copied ? 'Copied' : `Copy ${label}`}
          title={copied ? 'Copied' : 'Copy'}
          onClick={() => void copy()}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
    </div>
  )
}

export function GenMetaPanel({
  prompt,
  negative,
  rows,
}: {
  prompt?: string
  negative?: string
  rows: { label: string; value: string }[]
}) {
  if (!prompt && !negative && !rows.length) {
    return null
  }
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-md border border-line bg-bg p-4">
      {prompt ? <CopyBlock label="Prompt" value={prompt} /> : null}
      {negative ? <CopyBlock label="Negative prompt" value={negative} /> : null}
      {rows.length ? (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          {rows.map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className="text-xs text-muted">{row.label}</dt>
              <dd className="break-all text-ink">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  )
}

export function ImageInfo({ text, raw, busy, civitai }: ImageInfoProps) {
  const site = useSettingsStore((s) => s.civitaiSite)
  if (busy) {
    return <p className="text-sm text-muted">Reading…</p>
  }
  if (!text && !Object.keys(raw).length) {
    return <p className="text-sm text-muted">Drop an image or .safetensors file</p>
  }
  const parsed = parsePngInfo(text)
  const rows: { label: string; value: string }[] = []
  if (parsed.width != null && parsed.height != null) {
    rows.push({ label: 'Size', value: `${parsed.width}x${parsed.height}` })
  }
  for (const field of SETTINGS) {
    const value = parsed[field.key]
    if (value === undefined || value === '' || field.key === 'checkpoint') {
      continue
    }
    rows.push({ label: field.label === 'CFG scale' ? 'CFG' : field.label, value: String(value) })
  }
  const structured = Boolean(parsed.prompt || parsed.negativePrompt || parsed.checkpoint || rows.length)
  const rawKeys = Object.keys(raw).sort((a, b) => Number(a === 'prompt') - Number(b === 'prompt'))
  const href = civitai ? civitaiUrl(civitaiHost(site), civitai) : ''
  const modelName = (href && civitai?.model?.name) || parsed.checkpoint || ''
  const hashRows = [
    { label: 'AutoV1', value: parsed.autov1 || '—' },
    { label: 'AutoV2', value: parsed.modelHash || '—' },
    { label: 'AutoV3', value: parsed.autov3 || '—' },
    { label: 'SHA256', value: parsed.sha256 || '—' },
  ]

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-md border border-line bg-bg p-4">
        {modelName ? (
          href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-xl font-semibold leading-tight text-ink hover:text-accent"
            >
              {modelName}
            </a>
          ) : (
            <h2 className="text-xl font-semibold leading-tight text-ink">{modelName}</h2>
          )
        ) : null}
        <dl className={['grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4', modelName ? 'mt-3' : ''].join(' ')}>
          {hashRows.map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className="text-xs text-muted">{row.label}</dt>
              <dd className={['break-all', row.value === '—' ? 'text-muted' : 'text-ink'].join(' ')}>{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <GenMetaPanel prompt={parsed.prompt} negative={parsed.negativePrompt} rows={rows} />
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
