import { Dialog } from '@/components/controls/dialog/Dialog.tsx'
import {
  downloadCivitaiModel,
  type CivitaiModelDetail,
  type CivitaiModelFile,
  type CivitaiModelVersionDetail,
} from '@/lib/api.ts'
import { AUTHOR_ALIAS_RE, authorAlias, authorAliasConflict } from '@/lib/civitai/download.ts'
import { isCivitaiFileDownloaded } from '@/lib/civitai/downloaded.ts'
import { loadCivitaiPage, peekCivitaiPage } from '@/lib/civitai/pageCache.ts'
import { pickVersionId } from '@/lib/civitai/version.ts'
import { SelectField } from '@/components/controls/select/SelectField.tsx'
import { IconButton } from '@/components/controls/button/IconButton.tsx'
import { toast } from '@/stores/toastStore.ts'
import { useIssuesStore } from '@/stores/issuesStore.ts'
import { useModelsStore } from '@/stores/modelsStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useEffect, useMemo, useState } from 'react'

function fileFor(version: CivitaiModelVersionDetail | undefined): CivitaiModelFile | undefined {
  return version?.files?.find((file) => file.primary) || version?.files?.[0]
}

function fileSize(bytes: number) {
  if (!bytes) {
    return ''
  }
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  }
  if (bytes >= 1024 ** 2) {
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function filePrecision(file: CivitaiModelFile) {
  const metadata = file.metadata || {}
  const entry = Object.entries(metadata).find(([key, value]) => {
    const normalized = key.toLowerCase()
    return ['fp', 'precision', 'format'].includes(normalized) && Boolean(value)
  })
  return entry?.[1]?.toUpperCase() || ''
}

function fileLabel(file: CivitaiModelFile) {
  return [file.name, filePrecision(file), file.sizeBytes ? fileSize(file.sizeBytes) : ''].filter(Boolean).join(' · ')
}

export function CivitaiDownloadDialog({
  modelId,
  preferredVersionId,
  onClose,
  onDownloaded,
  onDownloadStart,
  onDownloadFinished,
}: {
  modelId: number
  preferredVersionId?: number
  onClose: () => void
  onDownloaded: () => void
  onDownloadStart: () => void
  onDownloadFinished: (success: boolean) => void
}) {
  const bases = useSettingsStore((state) => state.civitaiBrowse.baseModels)
  const download = useSettingsStore((state) => state.civitaiDownload)
  const checkpoints = useModelsStore((state) => state.checkpoints)
  const diffusionModels = useModelsStore((state) => state.diffusion_models)
  const loras = useModelsStore((state) => state.loras)
  const vae = useModelsStore((state) => state.vae)
  const textEncoders = useModelsStore((state) => state.text_encoders)
  const controlnet = useModelsStore((state) => state.controlnet)
  const embeddings = useModelsStore((state) => state.embeddings)
  const wildcards = useModelsStore((state) => state.wildcards)
  const localModels = useMemo(
    () => [
      ...checkpoints,
      ...diffusionModels,
      ...loras,
      ...vae,
      ...textEncoders,
      ...controlnet,
      ...embeddings,
      ...wildcards,
    ],
    [checkpoints, controlnet, diffusionModels, embeddings, loras, textEncoders, vae, wildcards],
  )
  const [model, setModel] = useState<CivitaiModelDetail | null>(null)
  const [versionId, setVersionId] = useState<number | null>(preferredVersionId ?? null)
  const [fileId, setFileId] = useState<number | null>(null)
  const [modelName, setModelName] = useState('')
  const [creatorAlias, setCreatorAlias] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    const cached = peekCivitaiPage(modelId)
    if (cached?.model && !cached.error) {
      setModel(cached.model)
      setVersionId(
        preferredVersionId && cached.model.versions.some((item) => item.id === preferredVersionId)
          ? preferredVersionId
          : cached.versionId ?? pickVersionId(cached.model.versions, bases) ?? null,
      )
    }
    void loadCivitaiPage(modelId, bases).then((page) => {
      if (!alive) {
        return
      }
      if (page.error || !page.model) {
        setError(page.error || 'Could not load model details.')
        return
      }
      setModel(page.model)
      setVersionId(
        preferredVersionId && page.model.versions.some((item) => item.id === preferredVersionId)
          ? preferredVersionId
          : page.versionId,
      )
    })
    return () => {
      alive = false
    }
  }, [bases, modelId, preferredVersionId])

  useEffect(() => {
    if (!model) {
      return
    }
    setModelName(model.name)
    setCreatorAlias(authorAlias(download.authorAliases, model.creator))
  }, [download.authorAliases, model])

  const version = useMemo(
    () => model?.versions.find((item) => item.id === versionId) || model?.versions[0],
    [model, versionId],
  )
  const file = version?.files?.find((item) => item.id === fileId) || fileFor(version)
  const versionOptions = model && version
    ? [version, ...model.versions.filter((item) => item.id !== version.id)]
    : []
  const custom = download.modelNaming === 'custom'
  const aliasValue = creatorAlias.trim()
  const aliasIsOriginal = Boolean(model && aliasValue.toLowerCase() === model.creator.toLowerCase())
  const aliasInvalid =
    custom &&
    (!aliasValue ||
      (!aliasIsOriginal && !AUTHOR_ALIAS_RE.test(aliasValue)) ||
      authorAliasConflict(download.authorAliases, model?.creator || '', aliasValue))
  const canDownload = Boolean(model && version && file && !busy && modelName.trim() && !aliasInvalid)

  useEffect(() => {
    setFileId(fileFor(version)?.id ?? null)
  }, [version])

  async function submit() {
    if (!model || !version || !file || !canDownload) {
      return
    }
    setBusy(true)
    setError('')
    onDownloadStart()
    onClose()
    let success = false
    try {
      const result = await downloadCivitaiModel({
        modelId: model.id,
        versionId: version.id,
        ...(file.id > 0 ? { fileId: file.id } : {}),
        customNaming: custom,
        modelName: modelName.trim(),
        creatorAlias: creatorAlias.trim(),
      })
      if (custom) {
        const aliases = { ...useSettingsStore.getState().civitaiDownload.authorAliases }
        const existing = Object.keys(aliases).find((name) => name.toLowerCase() === model.creator.toLowerCase())
        const alias = creatorAlias.trim()
        if (!alias || alias.toLowerCase() === model.creator.toLowerCase()) {
          if (existing) {
            delete aliases[existing]
          }
        } else {
          if (existing && existing !== model.creator) {
            delete aliases[existing]
          }
          aliases[model.creator] = alias
        }
        useSettingsStore.getState().setCivitaiDownload({ authorAliases: aliases })
      }
      if ('queued' in result && result.queued) {
        toast(`Queued ${file.name}`, 'ok')
      } else {
        const downloadedName = result.paths[0]?.split(/[\\/]/).pop() || file.name
        toast(`Downloaded ${downloadedName}`, 'ok')
      }
      success = true
      onDownloaded()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not download the model.', 'error')
      void useIssuesStore.getState().load()
    } finally {
      onDownloadFinished(success)
      setBusy(false)
    }
  }

  return (
    <Dialog onClose={busy ? () => {} : onClose} className="w-[min(92vw,42rem)]">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">Download from CivitAI</p>
            <p className="mt-0.5 text-xs text-muted">{model?.name || 'Loading model…'}</p>
          </div>
          <IconButton aria-label="Close" disabled={busy} onClick={onClose}>×</IconButton>
        </div>
        {error ? <p className="text-sm text-red-bright">{error}</p> : null}
        {!model && !error ? <p className="text-sm text-muted">Loading model details…</p> : null}
        {model && version ? (
          <>
            {model.versions.length > 1 ? (
              <label className="flex flex-col gap-1 text-sm text-ink">
                <span className="text-xs text-muted">Version</span>
                <SelectField
                  value={String(version.id)}
                  onChange={(value) => {
                    setVersionId(Number(value))
                    setFileId(null)
                  }}
                  options={versionOptions.map((item) => ({
                    value: String(item.id),
                    label: [
                      item.name || `v${item.id}`,
                      item.baseModel || 'Unknown base',
                      fileFor(item)?.metadata?.fp || fileFor(item)?.name || '',
                    ]
                      .filter(Boolean)
                      .join(' · '),
                    ...(item.files.some((file) => isCivitaiFileDownloaded(file, localModels))
                      ? { badge: 'Downloaded' }
                      : {}),
                  }))}
                />
              </label>
            ) : null}
            {version.files.length > 1 ? (
              <label className="flex flex-col gap-1 text-sm text-ink">
                <span className="text-xs text-muted">File variant</span>
                <SelectField
                  value={String(file?.id || '')}
                  onChange={(value) => setFileId(Number(value))}
                  options={version.files.map((item) => ({
                    value: String(item.id),
                    label: fileLabel(item),
                    ...(isCivitaiFileDownloaded(item, localModels) ? { badge: 'Downloaded' } : {}),
                  }))}
                />
              </label>
            ) : null}
            <p className="text-xs text-muted">
              File: <span className="text-ink">{file?.name || 'No downloadable file'}</span>
              {file?.sizeBytes ? ` · ${fileSize(file.sizeBytes)}` : ''}
            </p>
            {custom ? (
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
                <p className="col-span-3 text-xs uppercase tracking-wide text-muted">Custom naming</p>
                <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
                  Original creator
                  <input
                    className="w-full rounded border border-line bg-bg px-2 py-1.5 text-sm text-muted"
                    value={model.creator}
                    readOnly
                    disabled
                  />
                </label>
                <span className="pb-2 text-muted">→</span>
                <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
                  Filename prefix
                  <input
                    className={[
                      'w-full rounded border bg-field px-2 py-1.5 text-sm text-ink outline-none',
                      aliasInvalid ? 'border-red' : 'border-line focus:border-accent',
                    ].join(' ')}
                    value={creatorAlias}
                    onChange={(event) => setCreatorAlias(event.target.value)}
                    spellCheck={false}
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
                  Original model
                  <input
                    className="w-full rounded border border-line bg-bg px-2 py-1.5 text-sm text-muted"
                    value={model.name}
                    readOnly
                    disabled
                  />
                </label>
                <span className="pb-2 text-muted">→</span>
                <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
                  Filename
                  <input
                    className="w-full rounded border border-line bg-field px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
                    value={modelName}
                    onChange={(event) => setModelName(event.target.value)}
                    spellCheck={false}
                  />
                </label>
                {aliasInvalid ? (
                  <p className="col-span-3 text-xs text-red-bright">
                    Use a unique creator prefix with letters, numbers, dots, dashes, or underscores.
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded px-2.5 py-1.5 text-sm text-muted hover:bg-line hover:text-ink" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="rounded bg-accent px-3 py-1.5 text-sm text-ink disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!canDownload}
            onClick={() => void submit()}
          >
            {busy ? 'Downloading…' : 'Download'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
