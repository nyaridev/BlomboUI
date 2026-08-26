import { MediaCarousel } from '@/components/models/MediaCarousel.tsx'
import type { CivitaiImage, CivitaiVersion } from '@/lib/api.ts'
import { civitaiHost, useSettingsStore } from '@/stores/settingsStore.ts'
import { useState, type ReactNode } from 'react'
import { CivitaiImageMetaPanel } from './CivitaiImageMeta.tsx'
import { civitaiUrl } from './CivitaiLayouts.tsx'

type Status = 'idle' | 'looking' | 'found' | 'none'

const BTN =
  'inline-flex h-8 items-center justify-center rounded border px-3 text-sm leading-none text-ink'

function OpenLink({ href, label, tone }: { href: string; label: string; tone?: 'red' }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={[
        BTN,
        tone === 'red' ? 'border-red bg-red hover:brightness-110' : 'border-accent bg-accent hover:brightness-110',
      ].join(' ')}
    >
      {label}
    </a>
  )
}

function Stage({ fail, children }: { fail?: boolean; children: ReactNode }) {
  return (
    <div
      className={[
        'relative w-full overflow-hidden',
        fail ? 'h-11 rounded-md border border-red bg-red/15' : 'h-[34rem]',
      ].join(' ')}
    >
      {children}
    </div>
  )
}

function Message({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <div
      className={['flex h-full items-center justify-center gap-2', onClick ? 'cursor-pointer' : ''].join(' ')}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

function authorImages(info: CivitaiVersion): CivitaiImage[] {
  const creator = info.model?.creator?.username
  const list = (info.images || []).filter((image) => image.url)
  if (creator && list.some((image) => image.username)) {
    const matched = list.filter((image) => image.username === creator)
    if (matched.length) {
      return matched
    }
  }
  return list
}

export function CivitaiSection({
  info,
  status,
  preview,
  previewAlt = 'Dropped image',
  onPick,
  onClear,
  onGenerate,
  generateDisabled,
  sending,
  onReplacePreview,
  replacing,
}: {
  info: CivitaiVersion | null
  status: Status
  preview?: string | null
  previewAlt?: string
  onPick?: () => void
  onClear?: () => void
  onGenerate?: () => void
  generateDisabled?: boolean
  sending?: boolean
  onReplacePreview?: (url: string) => void
  replacing?: boolean
}) {
  const [currentUrl, setCurrentUrl] = useState('')
  const site = useSettingsStore((s) => s.civitaiSite)
  const preferred = civitaiHost(site)
  let body: ReactNode
  let fail = false
  let framed = true
  if (preview) {
    framed = false
    body = (
      <MediaCarousel
        key={preview}
        items={[{ url: preview }]}
        alt={previewAlt}
        onCurrent={setCurrentUrl}
        openHotkey="f"
      />
    )
  } else if (status === 'idle') {
    body = (
      <Message onClick={onPick}>
        <p className="text-sm text-muted">Drop an image or .safetensors file, or click to pick</p>
      </Message>
    )
  } else if (status === 'looking') {
    body = (
      <Message>
        <span className="inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-muted border-t-ink" />
        <span className="text-sm text-muted">Searching CivitAI…</span>
      </Message>
    )
  } else if (status !== 'found' || !info) {
    fail = true
    body = (
      <Message onClick={onPick}>
        <p className="text-sm text-ink">No CivitAI match</p>
      </Message>
    )
  } else {
    framed = false
    const name = info.model?.name || 'CivitAI model'
    const images = authorImages(info)
    body = (
      <MediaCarousel
        key={images.map((image) => image.url).join('\n')}
        items={images.map((image) => ({ url: image.url as string, type: image.type }))}
        alt={name}
        onCurrent={setCurrentUrl}
        openHotkey="f"
      />
    )
  }

  const links = status === 'found' && info ? info : null
  const gallery = links ? authorImages(links) : []
  const current = gallery.find((image) => image.url === currentUrl) ?? gallery[0]
  const currentMeta = !preview && current?.meta && typeof current.meta === 'object' ? current.meta : null
  const com = links ? civitaiUrl('civitai.com', links) : ''
  const red = links ? civitaiUrl('civitai.red', links) : ''
  const civitaiBtns = Boolean(com && red)
  const otherBtns = Boolean(onClear || onGenerate || onReplacePreview)
  const canReplace = Boolean(onReplacePreview && currentUrl && !preview && status === 'found')

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {framed ? <Stage fail={fail}>{body}</Stage> : body}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {onClear ? (
          <button type="button" className={`${BTN} border-line bg-field`} onClick={onClear}>
            Clear
          </button>
        ) : null}
        {canReplace ? (
          <button
            type="button"
            className={`${BTN} border-accent bg-accent disabled:opacity-40`}
            disabled={replacing}
            onClick={() => onReplacePreview?.(currentUrl)}
          >
            {replacing ? 'Replacing…' : 'Replace Preview'}
          </button>
        ) : null}
        {onGenerate ? (
          <button
            type="button"
            className={`${BTN} border-accent bg-accent disabled:opacity-40`}
            disabled={generateDisabled}
            onClick={onGenerate}
          >
            {sending ? 'Sending…' : 'Send to Generate'}
          </button>
        ) : null}
        {civitaiBtns ? (
          <>
            {otherBtns ? <span className="h-5 w-px shrink-0 bg-line" /> : null}
            {preferred === 'civitai.red' ? (
              <>
                <OpenLink href={red} label="civitai.red" tone="red" />
                <OpenLink href={com} label="civitai.com" />
              </>
            ) : (
              <>
                <OpenLink href={com} label="civitai.com" />
                <OpenLink href={red} label="civitai.red" tone="red" />
              </>
            )}
          </>
        ) : null}
      </div>
      {currentMeta ? <CivitaiImageMetaPanel meta={currentMeta} /> : null}
    </div>
  )
}
