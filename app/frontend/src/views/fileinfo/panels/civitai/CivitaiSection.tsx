import { MediaCarousel, type MediaCarouselItem } from '@/components/composites/models/MediaCarousel.tsx'
import { ContextMenu, ContextMenuItem } from '@/components/composites/chrome/ContextMenu.tsx'
import type { CivitaiImage, CivitaiVersion } from '@/lib/api.ts'
import { openInCivitaiPanel } from '@/lib/civitai/openTab.ts'
import { useState, type MouseEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { CivitaiImageMetaPanel } from '@/views/fileinfo/panels/civitai/CivitaiImageMeta.tsx'
import { civitaiUrl } from '@/views/fileinfo/panels/civitai/CivitaiLayouts.tsx'

type Status = 'idle' | 'looking' | 'found' | 'none'

const BTN =
  'inline-flex h-8 items-center justify-center rounded border px-3 text-sm leading-none text-ink'

function OpenLink({
  label,
  tone,
  onOpen,
}: {
  label: string
  tone?: 'red'
  onOpen: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      className={[
        BTN,
        tone === 'red' ? 'border-red bg-red hover:brightness-110' : 'border-accent bg-accent hover:brightness-110',
      ].join(' ')}
      onClick={onOpen}
    >
      {label}
    </button>
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
  items,
  previewAlt = 'Dropped image',
  onPick,
  onClear,
  onGenerate,
  generateDisabled,
  sending,
  onReplacePreview,
  replacing,
  onSlide,
}: {
  info: CivitaiVersion | null
  status: Status
  items?: MediaCarouselItem[]
  previewAlt?: string
  onPick?: () => void
  onClear?: () => void
  onGenerate?: () => void
  generateDisabled?: boolean
  sending?: boolean
  onReplacePreview?: (url: string) => void
  replacing?: boolean
  onSlide?: (url: string) => void
}) {
  const [currentUrl, setCurrentUrl] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; href: string } | null>(null)
  const navigate = useNavigate()
  const local = Boolean(items?.length)
  function noteCurrent(url: string) {
    setCurrentUrl(url)
    if (local) {
      onSlide?.(url)
    }
  }
  let body: ReactNode
  let fail = false
  let framed = true
  if (local && items) {
    framed = false
    body = (
      <MediaCarousel
        key={items.map((item) => item.url).join('\n')}
        items={items}
        alt={previewAlt}
        onCurrent={noteCurrent}
        openHotkey="f"
      />
    )
  } else if (status === 'idle') {
    body = (
      <Message onClick={onPick}>
        <p className="text-sm text-muted">Drop images, videos, or a .safetensors file, or click to pick</p>
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
        onCurrent={noteCurrent}
        openHotkey="f"
      />
    )
  }

  const links = status === 'found' && info ? info : null
  const gallery = links ? authorImages(links) : []
  const current = gallery.find((image) => image.url === currentUrl) ?? gallery[0]
  const currentMeta = !local && current?.meta && typeof current.meta === 'object' ? current.meta : null
  const com = links ? civitaiUrl('civitai.com', links) : ''
  const red = links ? civitaiUrl('civitai.red', links) : ''
  const civitaiBtns = Boolean(com && red)
  const otherBtns = Boolean(onClear || onGenerate || onReplacePreview)
  const canReplace = Boolean(onReplacePreview && currentUrl && !local && status === 'found')

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
            <OpenLink
              label="civitai.com"
              onOpen={(event) => {
                const box = event.currentTarget.getBoundingClientRect()
                setMenu({ x: box.left, y: box.bottom + 4, href: com })
              }}
            />
            <OpenLink
              label="civitai.red"
              tone="red"
              onOpen={(event) => {
                const box = event.currentTarget.getBoundingClientRect()
                setMenu({ x: box.left, y: box.bottom + 4, href: red })
              }}
            />
          </>
        ) : null}
      </div>
      {currentMeta ? <CivitaiImageMetaPanel meta={currentMeta} /> : null}
      {menu && links ? (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <ContextMenuItem
            label="Local"
            icon="square-arrow-out-up-right"
            onClick={() => {
              setMenu(null)
              openInCivitaiPanel({ id: links.modelId, name: links.model?.name || 'CivitAI model' }, links.id)
              navigate('/models')
            }}
          />
          <ContextMenuItem
            label="Website"
            icon="external-link"
            onClick={() => {
              const href = menu.href
              setMenu(null)
              window.open(href, '_blank', 'noreferrer')
            }}
          />
        </ContextMenu>
      ) : null}
    </div>
  )
}
