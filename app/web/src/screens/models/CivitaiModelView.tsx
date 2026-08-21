import { AppIcon } from '@/components/AppIcon.tsx'
import type { CivitaiModelDetail } from '@/lib/api.ts'
import { sanitizeCivitaiHtml } from '@/lib/civitaiHtml.ts'
import { loadCivitaiPage, peekCivitaiPage, setCachedVersion } from '@/lib/civitaiPageCache.ts'
import { civitaiModelHref, pickVersionId } from '@/lib/civitaiVersion.ts'
import { creatorUrl } from '@/screens/fileinfo/CivitaiLayouts.tsx'
import { CivitaiPreviewStrip } from './CivitaiPreviewStrip.tsx'
import { civitaiHost, useSettingsStore } from '@/stores/settingsStore.ts'
import { toast } from '@/stores/toastStore.ts'
import { useEffect, useMemo, useRef, useState } from 'react'

function chipClass(active: boolean, initial: boolean) {
  return [
    'rounded border px-2 py-1 text-xs',
    active
      ? 'border-accent bg-accent text-ink'
      : initial
        ? 'border-purple/60 bg-purple/20 text-purple-bright hover:bg-purple/30'
        : 'border-line bg-field text-muted hover:text-ink',
  ].join(' ')
}

function formatCount(value?: number) {
  if (!value) {
    return ''
  }
  return value.toLocaleString()
}

const DESCRIPTION_CLASS = [
  'civitai-desc text-sm leading-6 text-ink',
  '[&_a]:text-purple-bright [&_a]:underline [&_a]:decoration-purple-bright/60 [&_a]:underline-offset-2',
  '[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-purple/60 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted',
  '[&_code]:rounded [&_code]:border [&_code]:border-line [&_code]:bg-bg [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-purple-bright',
  '[&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-semibold',
  '[&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold',
  '[&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-base [&_h3]:font-semibold',
  '[&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:font-semibold',
  '[&_h5]:mt-3 [&_h5]:mb-1 [&_h5]:text-sm [&_h5]:font-semibold',
  '[&_h6]:mt-3 [&_h6]:mb-1 [&_h6]:text-xs [&_h6]:font-semibold [&_h6]:uppercase [&_h6]:tracking-wide [&_h6]:text-muted',
  '[&_hr]:my-4 [&_hr]:border-line',
  '[&_img]:my-3 [&_img]:block [&_img]:max-h-[40rem] [&_img]:max-w-full [&_img]:rounded-md [&_img]:border [&_img]:border-line [&_img]:bg-bg [&_img]:p-1 [&_img]:shadow-sm',
  '[&_li]:pl-1',
  '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6',
  '[&_p]:my-2',
  '[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-line [&_pre]:bg-bg [&_pre]:p-3',
  '[&_strong]:font-semibold [&_em]:text-purple-bright',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6',
].join(' ')

export function CivitaiModelView({
  modelId,
  preferredBases,
}: {
  modelId: number
  preferredBases: string[]
}) {
  const site = useSettingsStore((state) => state.civitaiSite)
  const nsfw = useSettingsStore((state) => state.civitaiBrowse.nsfw)
  const tab = useSettingsStore((state) => state.civitaiTabs.find((item) => item.id === modelId))
  const setCivitaiBrowse = useSettingsStore((state) => state.setCivitaiBrowse)
  const host = civitaiHost(site)
  const cached = peekCivitaiPage(modelId)
  const [model, setModel] = useState<CivitaiModelDetail | null>(cached?.model || null)
  const [versionId, setVersionId] = useState<number | null>(cached?.versionId ?? tab?.versionId ?? null)
  const [busy, setBusy] = useState(!cached?.model && !cached?.error)
  const [error, setError] = useState(cached?.error || '')
  const [copied, setCopied] = useState('')
  const basesRef = useRef(preferredBases)
  basesRef.current = preferredBases

  useEffect(() => {
    let alive = true
    const hit = peekCivitaiPage(modelId)
    const saved = useSettingsStore.getState().civitaiTabs.find((item) => item.id === modelId)
    if (hit?.model && !hit.error) {
      setModel(hit.model)
      setVersionId(saved?.versionId ?? hit.versionId)
      setBusy(false)
      setError('')
    }
    void loadCivitaiPage(modelId, basesRef.current).then((page) => {
      if (!alive) {
        return
      }
      setModel(page.model)
      const current = useSettingsStore.getState().civitaiTabs.find((item) => item.id === modelId)
      setVersionId(current?.versionId ?? page.versionId)
      setError(page.error)
      setBusy(false)
    })
    return () => {
      alive = false
    }
  }, [modelId])

  useEffect(() => {
    setCachedVersion(modelId, versionId)
  }, [modelId, versionId])

  useEffect(() => {
    if (!model || versionId === null) {
      return
    }
    const store = useSettingsStore.getState()
    const current = store.civitaiTabs.find((item) => item.id === modelId)
    if (!current) {
      return
    }
    const savedInitial = current.initialVersionId
    const initialVersionId =
      savedInitial !== undefined && model.versions.some((item) => item.id === savedInitial)
        ? savedInitial
        : pickVersionId(model.versions, preferredBases) ?? versionId
    const selectedVersionId = model.versions.some((item) => item.id === versionId) ? versionId : initialVersionId
    if (selectedVersionId !== versionId) {
      setVersionId(selectedVersionId)
      return
    }
    if (current.initialVersionId === initialVersionId && current.versionId === selectedVersionId) {
      return
    }
    store.setCivitaiTabs(
      store.civitaiTabs.map((item) =>
        item.id === modelId
          ? { ...item, initialVersionId, versionId: selectedVersionId }
          : item,
      ),
    )
  }, [model, modelId, preferredBases, tab?.initialVersionId, tab?.versionId, versionId])

  const version = useMemo(
    () => model?.versions.find((item) => item.id === versionId) || model?.versions[0],
    [model, versionId],
  )
  const stats = [
    formatCount(model?.stats.downloadCount) ? `${formatCount(model?.stats.downloadCount)} downloads` : '',
    formatCount(model?.stats.thumbsUpCount) ? `${formatCount(model?.stats.thumbsUpCount)} likes` : '',
    formatCount(model?.stats.favoriteCount) ? `${formatCount(model?.stats.favoriteCount)} favorites` : '',
    model?.stats.rating ? `${model.stats.rating.toFixed(1)} rating` : '',
  ].filter(Boolean)
  const description = sanitizeCivitaiHtml(version?.description || model?.description || '')
  const initialVersionId = tab?.initialVersionId
  const selectionChanged = initialVersionId !== undefined && version !== undefined && version.id !== initialVersionId

  if (busy) {
    return <p className="text-sm text-muted">Loading model…</p>
  }
  if (error) {
    return <p className="text-sm text-red-bright">{error}</p>
  }
  if (!model || !version) {
    return <p className="text-sm text-muted">No model details.</p>
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-ink">{model.name}</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
              {model.creator ? (
                <a
                  href={creatorUrl(host, model.creator)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-purple-bright hover:underline"
                >
                  {model.creator}
                </a>
              ) : null}
              {model.type ? <span className="text-muted">{model.type}</span> : null}
              {version.baseModel ? <span className="text-muted">{version.baseModel}</span> : null}
            </p>
            {stats.length ? <p className="mt-1 text-xs text-muted">{stats.join(' · ')}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className={[
                'inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm',
                nsfw ? 'border-accent bg-accent text-ink' : 'border-line bg-field text-muted hover:text-ink',
              ].join(' ')}
              aria-pressed={nsfw}
              title={nsfw ? 'Blur mature previews' : 'Show mature previews'}
              onClick={() => setCivitaiBrowse({ nsfw: !nsfw })}
            >
              <AppIcon id={nsfw ? 'eye' : 'eye-off'} size={14} />
              NSFW
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded border border-accent bg-accent px-3 py-1.5 text-sm text-ink hover:brightness-110"
              onClick={() => toast("Download isn't implemented yet")}
            >
              <AppIcon id="download" size={14} />
              Download
              {version.paid ? ` (${version.buzz ? `${version.buzz} Buzz` : 'Paid'})` : ''}
            </button>
            <a
              href={civitaiModelHref(host, model.id, version.id)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded border border-line bg-field px-3 py-1.5 text-sm text-ink hover:text-ink"
            >
              <AppIcon id="external-link" size={14} />
              CivitAI
            </a>
          </div>
        </div>
        {model.versions.length ? (
          <div className="flex flex-wrap gap-1.5">
            {model.versions.map((item) => (
              <button
                key={item.id}
                type="button"
                className={chipClass(item.id === version.id, selectionChanged && item.id === initialVersionId)}
                title={[
                  item.baseModel || item.name,
                  selectionChanged && item.id === initialVersionId ? 'Opening variant' : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                onClick={() => setVersionId(item.id)}
              >
                {item.name || item.baseModel || `v${item.id}`}
                {item.baseModel ? ` · ${item.baseModel}` : ''}
              </button>
            ))}
          </div>
        ) : null}
        <CivitaiPreviewStrip images={version.images} alt={model.name} showNsfw={nsfw} />
        {version.trainedWords.length ? (
          <div className="rounded-md border border-line bg-panel p-3">
            <p className="mb-2 text-xs uppercase tracking-wide text-muted">Trigger words</p>
            <div className="flex flex-wrap gap-1.5">
              {version.trainedWords.map((word) => (
                <button
                  key={word}
                  type="button"
                  title={copied === word ? 'Copied' : `Copy ${word}`}
                  className={[
                    'rounded-full border border-purple/40 bg-purple/25 px-2.5 py-1 text-sm text-purple-bright hover:bg-purple/40',
                    copied === word ? 'bg-purple/50' : '',
                  ].join(' ')}
                  onClick={() => {
                    void navigator.clipboard.writeText(word).then(
                      () => {
                        setCopied(word)
                        window.setTimeout(() => setCopied(''), 1200)
                      },
                      () => {},
                    )
                  }}
                >
                  {word}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {description ? (
          <div className="rounded-md border border-line bg-panel p-3">
            <p className="mb-2 text-xs uppercase tracking-wide text-muted">Description</p>
            <div
              className={DESCRIPTION_CLASS}
              dangerouslySetInnerHTML={{ __html: description }}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
