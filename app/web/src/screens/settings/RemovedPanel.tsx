import { useCallback, useEffect, useState } from 'react'
import { AppIcon } from '@/components/AppIcon.tsx'
import { ConfirmDialog } from '@/components/Dialog.tsx'
import { NumberField } from '@/components/NumberField.tsx'
import { ThumbnailScopePicker } from '@/components/ThumbnailScopePicker.tsx'
import { TilePreview } from '@/components/TilePreview.tsx'
import {
  deleteAllRemoved,
  deleteRemoved,
  listRemoved,
  removedThumbUrl,
  restoreRemoved,
  revealRemoved,
  type RemovedItem,
} from '@/lib/api.ts'
import { trashThumbView } from '@/lib/thumbView.ts'
import { formatUnix } from '@/lib/timeDisplay.ts'
import { useModelsStore } from '@/stores/modelsStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useThumbView } from '@/stores/thumbnailScopeStore.ts'
import { toast } from '@/stores/toastStore.ts'
import { SettingsCard } from './SettingsBlock.tsx'

export const REMOVED_QUERY = 'removed trash restore delete hours size gigabyte explorer thumbnail scope fallback'

const KINDS: Record<string, string> = {
  checkpoints: 'Checkpoint',
  loras: 'LoRA',
  vae: 'VAE',
  controlnet: 'ControlNet',
  embeddings: 'Embedding',
  wildcards: 'Wildcard',
}

function formatSize(bytes: number) {
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  }
  if (bytes >= 1024 ** 2) {
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  }
  if (bytes >= 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }
  return `${bytes} B`
}

export function RemovedPanel({ query = '' }: { query?: string }) {
  const removedAfterHours = useSettingsStore((s) => s.removedAfterHours)
  const removedMaxGb = useSettingsStore((s) => s.removedMaxGb)
  const setRemovedAfterHours = useSettingsStore((s) => s.setRemovedAfterHours)
  const setRemovedMaxGb = useSettingsStore((s) => s.setRemovedMaxGb)
  const timeDisplay = useSettingsStore((s) => s.timeDisplay)
  const view = useThumbView('trash')
  const pull = useModelsStore((s) => s.pull)
  const modelStamp = useModelsStore((s) =>
    ['checkpoints', 'loras', 'wildcards']
      .flatMap((kind) => s[kind as 'checkpoints' | 'loras' | 'wildcards'].map((item) => item.path))
      .join('\n'),
  )
  const [items, setItems] = useState<RemovedItem[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, setPending] = useState<RemovedItem | 'all' | null>(null)

  const load = useCallback(async () => {
    try {
      setItems(await listRemoved())
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not load trash', 'error')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, modelStamp])

  async function restore(item: RemovedItem) {
    if (busy) {
      return
    }
    setBusy(item.id)
    try {
      await restoreRemoved(item.id)
      await pull()
      await load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not restore', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function purge(item: RemovedItem) {
    if (busy) {
      return
    }
    setBusy(item.id)
    try {
      await deleteRemoved(item.id)
      await load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not delete', 'error')
    } finally {
      setBusy(null)
      setPending(null)
    }
  }

  async function purgeAll() {
    if (busy) {
      return
    }
    setBusy('all')
    try {
      await deleteAllRemoved()
      await load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not delete', 'error')
    } finally {
      setBusy(null)
      setPending(null)
    }
  }

  async function reveal(item: RemovedItem) {
    try {
      await revealRemoved(item.id)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not open folder', 'error')
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <SettingsCard query={query} title="Clear trash after" terms="hours age expire purge removed">
        <NumberField value={removedAfterHours} onChange={setRemovedAfterHours} min={1} max={8760} suffix="h" />
        <p className="text-xs text-muted">Hours. Files older than this are deleted when BlomboUI starts.</p>
      </SettingsCard>
      <SettingsCard query={query} title="Maximum trash size" terms="gigabyte cap limit storage removed">
        <NumberField value={removedMaxGb} onChange={setRemovedMaxGb} min={1} max={10000} suffix="GB" />
        <p className="text-xs text-muted">Oldest files are deleted first when over this size.</p>
      </SettingsCard>
      <SettingsCard query={query} title="Trash" terms="list restore delete explorer trash clear removed thumbnail scope">
        <ThumbnailScopePicker fallbackKind="trash" />
        {items.length === 0 ? (
          <p className="text-xs text-muted">Trash is empty.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="rounded-md bg-red px-2 py-1.5 text-xs text-ink hover:opacity-90 disabled:opacity-40"
              disabled={busy !== null}
              onClick={() => setPending('all')}
            >
              Clear all
            </button>
            {items.map((item) => (
              <div key={item.id} className="relative rounded-md border border-line bg-field p-2 shadow-sm">
                <button
                  type="button"
                  className="absolute top-0.5 right-0.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded text-muted hover:text-ink"
                  aria-label="Open in Explorer"
                  title="Open in Explorer"
                  onClick={() => void reveal(item)}
                >
                  <AppIcon id="square-arrow-out-up-right" />
                </button>
                <div className="flex items-center gap-2 pr-8">
                  <TilePreview
                    className="w-11 shrink-0"
                    src={item.thumb ? removedThumbUrl(item.id, Math.round(item.removed_at), view || trashThumbView()) : null}
                    mark="?"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{item.name}</p>
                    <p className="truncate text-[11px] text-muted">
                      {KINDS[item.kind] || item.kind}
                      {item.ident ? ` · ${item.ident}` : ''}
                      {item.size ? ` · ${formatSize(item.size)}` : ''}
                      {item.removed_at ? ` · ${formatUnix(item.removed_at, timeDisplay)}` : ''}
                    </p>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    className="rounded-md bg-accent px-2 py-1.5 text-xs text-ink hover:opacity-90 disabled:opacity-40"
                    disabled={busy !== null}
                    onClick={() => void restore(item)}
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-red px-2 py-1.5 text-xs text-ink hover:opacity-90 disabled:opacity-40"
                    disabled={busy !== null}
                    onClick={() => setPending(item)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>
      {pending ? (
        <ConfirmDialog
          title={pending === 'all' ? 'Delete all permanently?' : 'Delete permanently?'}
          body="This cannot be restored."
          onClose={() => setPending(null)}
          actions={[
            { label: 'Cancel', onClick: () => setPending(null) },
            {
              label: pending === 'all' ? 'Clear all' : 'Delete',
              kind: 'primary',
              danger: true,
              onClick: () => {
                if (pending === 'all') {
                  void purgeAll()
                  return
                }
                void purge(pending)
              },
            },
          ]}
        />
      ) : null}
    </div>
  )
}
