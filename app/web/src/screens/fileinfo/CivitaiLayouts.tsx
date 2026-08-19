import type { CivitaiVersion } from '@/lib/api.ts'
import { civitaiHost, useSettingsStore } from '@/stores/settingsStore.ts'
import { useState, type ReactNode } from 'react'

export type Host = 'civitai.com' | 'civitai.red'

export function civitaiUrl(host: Host, info: CivitaiVersion) {
  if (!info.modelId || !info.id) {
    return ''
  }
  return `https://${host}/models/${info.modelId}?modelVersionId=${info.id}`
}

export function creatorUrl(host: Host, username: string) {
  return `https://${host}/user/${encodeURIComponent(username)}`
}

export function baseModelUrl(host: Host, base: string) {
  return `https://${host}/models?baseModels=${encodeURIComponent(base)}`
}

export function stripHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export type CivitaiLayoutData = {
  name: string
  modelHref: string
  creator: string
  creatorHref: string
  type: string
  version: string
  base: string
  baseHref: string
  description: string
  triggers: string[]
  copied: string
  onCopy: (word: string) => void
}

const PILL =
  'rounded-full border border-[#7c5cbf]/40 bg-[#7c5cbf]/25 px-2.5 py-1 text-sm text-[#c9b6f0] hover:bg-[#7c5cbf]/40'
const PILL_ON = 'bg-[#7c5cbf]/50'

function Link({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  if (!href) {
    return <span className={className}>{children}</span>
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  )
}

export function Pills({ data, className }: { data: CivitaiLayoutData; className?: string }) {
  if (!data.triggers.length) {
    return null
  }
  return (
    <div className={['flex flex-wrap gap-1.5', className].filter(Boolean).join(' ')}>
      {data.triggers.map((word) => (
        <button
          key={word}
          type="button"
          title={data.copied === word ? 'Copied' : `Copy ${word}`}
          className={[PILL, data.copied === word ? PILL_ON : ''].join(' ')}
          onClick={() => data.onCopy(word)}
        >
          {word}
        </button>
      ))}
    </div>
  )
}

export function Meta({ data, className }: { data: CivitaiLayoutData; className?: string }) {
  return (
    <div className={['flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm', className].filter(Boolean).join(' ')}>
      {data.creator ? (
        <Link href={data.creatorHref} className="text-accent hover:underline">
          {data.creator}
        </Link>
      ) : null}
      {data.type ? <span className="text-muted">{data.type}</span> : null}
      {data.version ? <span className="text-muted">{data.version}</span> : null}
    </div>
  )
}

export function Base({ data }: { data: CivitaiLayoutData }) {
  if (!data.base) {
    return null
  }
  return (
    <p className="text-sm">
      <span className="text-muted">Base </span>
      <Link href={data.baseHref} className="text-accent hover:underline">
        {data.base}
      </Link>
    </p>
  )
}

export function Name({ data, className }: { data: CivitaiLayoutData; className?: string }) {
  return (
    <Link
      href={data.modelHref}
      className={['font-semibold leading-tight text-ink hover:text-accent', className || 'text-2xl'].join(' ')}
    >
      {data.name}
    </Link>
  )
}

export function Desc({ data, className }: { data: CivitaiLayoutData; className?: string }) {
  if (!data.description) {
    return null
  }
  return (
    <p className={['whitespace-pre-wrap break-words text-muted', className || 'text-sm'].join(' ')}>
      {data.description}
    </p>
  )
}

export function useCivitaiData(info: CivitaiVersion | null): CivitaiLayoutData | null {
  const site = useSettingsStore((s) => s.civitaiSite)
  const [copied, setCopied] = useState('')
  if (!info) {
    return null
  }
  const host = civitaiHost(site)
  const creator = info.model?.creator?.username || ''
  const base = info.baseModel || ''
  return {
    name: info.model?.name || 'CivitAI model',
    modelHref: civitaiUrl(host, info),
    creator,
    creatorHref: creator ? creatorUrl(host, creator) : '',
    type: info.model?.type || '',
    version: info.name || '',
    base,
    baseHref: base ? baseModelUrl(host, base) : '',
    description: stripHtml(info.description || info.model?.description || ''),
    triggers: (info.trainedWords || []).filter(Boolean),
    copied,
    onCopy: (word) => {
      void navigator.clipboard.writeText(word).then(
        () => {
          setCopied(word)
          window.setTimeout(() => setCopied(''), 1200)
        },
        () => {},
      )
    },
  }
}
