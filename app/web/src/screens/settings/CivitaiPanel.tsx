import { ConfirmDialog } from '@/components/primitives/Dialog.tsx'
import { NumberField } from '@/components/primitives/NumberField.tsx'
import {
  civitaiJobBusy,
  clearCivitai,
  scrapeCivitai,
  type ClearKind,
  type ClearMode,
  type ScrapeKind,
  type ScrapeMode,
} from '@/lib/civitai/scrape.ts'
import { SettingsCard } from './SettingsBlock.tsx'
import { useToastStore } from '@/stores/toastStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useState } from 'react'

export const CIVITAI_QUERY =
  'civitai scrape fill missing overwrite force full thumbnail type trigger words checkpoint lora wildcards metadata clear auto retry attempts'

const PHRASE = 'I Understand'
const FILL = 'rounded bg-accent px-3 py-2 text-sm font-semibold text-ink enabled:hover:brightness-110 disabled:opacity-40'
const FORCE = 'rounded bg-orange px-3 py-2 text-sm font-semibold text-ink enabled:hover:brightness-110 disabled:opacity-40'
const FULL = 'rounded bg-red px-3 py-2 text-sm font-semibold text-ink enabled:hover:brightness-110 disabled:opacity-40'
const DANGER = 'rounded border border-line px-3 py-2 text-sm text-ink enabled:hover:bg-line disabled:opacity-40'

type Pending =
  | { kind: ScrapeKind; action: 'force' }
  | { kind: ScrapeKind; action: 'full' }
  | { kind: ClearKind; action: 'thumbs' }
  | { kind: ClearKind; action: 'meta' }

function kindLabel(kind: ScrapeKind | ClearKind) {
  if (kind === 'loras') {
    return 'LoRAs'
  }
  if (kind === 'wildcards') {
    return 'wildcards'
  }
  return 'base models'
}

export function CivitaiPanel({ query = '' }: { query?: string }) {
  const autoRetry = useSettingsStore((state) => state.civitaiAutoRetry)
  const autoRetryCount = useSettingsStore((state) => state.civitaiAutoRetryCount)
  const setAutoRetry = useSettingsStore((state) => state.setCivitaiAutoRetry)
  const setAutoRetryCount = useSettingsStore((state) => state.setCivitaiAutoRetryCount)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)

  async function runScrape(kind: ScrapeKind, action: ScrapeMode) {
    if (busy || civitaiJobBusy()) {
      return
    }
    setBusy(true)
    const ac = new AbortController()
    const store = useToastStore.getState()
    const noun = kindLabel(kind)
    const start =
      action === 'full' ? `Fully overwriting ${noun}…` : action === 'force' ? `Overwriting ${noun}…` : `Filling ${noun}…`
    const id = store.pushSticky(start, 'info', { onCancel: () => ac.abort() })
    const onProgress = (done: number, total: number) => {
      store.update(id, {
        text: `${start} ${done}/${total}`,
        progress: total ? (done / total) * 100 : 0,
      })
    }
    try {
      const result = await scrapeCivitai(kind, action, ac.signal, onProgress)
      if (result.cancelled) {
        store.finish(id, 'Cancelled', 'info')
        return
      }
      store.finish(id, `Filled ${result.filled} · skipped ${result.skipped} · no match ${result.missed}`, 'ok')
    } catch (err) {
      store.finish(id, err instanceof Error ? err.message : 'Civitai job failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function runClear(kind: ClearKind, mode: ClearMode) {
    if (busy || civitaiJobBusy()) {
      return
    }
    setBusy(true)
    const ac = new AbortController()
    const store = useToastStore.getState()
    const noun = kindLabel(kind)
    const start = mode === 'thumbs' ? `Clearing ${noun} thumbnails…` : `Clearing ${noun} metadata…`
    const id = store.pushSticky(start, 'info', { onCancel: () => ac.abort() })
    const onProgress = (done: number, total: number) => {
      store.update(id, {
        text: `${start} ${done}/${total}`,
        progress: total ? (done / total) * 100 : 0,
      })
    }
    try {
      const result = await clearCivitai(kind, mode, ac.signal, onProgress)
      if (result.cancelled) {
        store.finish(id, 'Cancelled', 'info')
        return
      }
      store.finish(id, `Cleared ${result.filled} · failed ${result.missed}`, 'ok')
    } catch (err) {
      store.finish(id, err instanceof Error ? err.message : 'Civitai job failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <SettingsCard query={query} title="Automatic retry" terms="civitai request search error retry attempts">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="check"
            checked={autoRetry}
            onChange={(event) => setAutoRetry(event.target.checked)}
          />
          Automatically retry failed CivitAI searches
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink">
          <span className="text-xs text-muted">Maximum retry attempts</span>
          <NumberField value={autoRetryCount} min={1} max={100} onChange={setAutoRetryCount} />
        </label>
        <p className="text-xs text-muted">
          Failed searches retry automatically up to this many times. The default is 20; you can cancel an active retry
          from the CivitAI screen.
        </p>
      </SettingsCard>
      <SettingsCard query={query} title="Fill missing" terms="scrape fill missing thumbnail type trigger">
        <p className="text-xs text-muted">Skip models that already have a thumbnail, type, or LoRA trigger words.</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={FILL} disabled={busy} onClick={() => void runScrape('checkpoints', 'missing')}>
            Base models
          </button>
          <button type="button" className={FILL} disabled={busy} onClick={() => void runScrape('loras', 'missing')}>
            LoRAs
          </button>
        </div>
      </SettingsCard>
      <SettingsCard query={query} title="Force overwrite" terms="scrape force overwrite skip thumbnail">
        <p className="text-xs text-muted">Fill models that do not already have a thumbnail. Existing thumbs are left alone.</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={FORCE} disabled={busy} onClick={() => setPending({ kind: 'checkpoints', action: 'force' })}>
            Base models
          </button>
          <button type="button" className={FORCE} disabled={busy} onClick={() => setPending({ kind: 'loras', action: 'force' })}>
            LoRAs
          </button>
        </div>
      </SettingsCard>
      <SettingsCard query={query} title="Full overwrite" terms="scrape full overwrite all replace">
        <p className="text-xs text-muted">Replace Civitai data for every match, including models already scraped.</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={FULL} disabled={busy} onClick={() => setPending({ kind: 'checkpoints', action: 'full' })}>
            Base models
          </button>
          <button type="button" className={FULL} disabled={busy} onClick={() => setPending({ kind: 'loras', action: 'full' })}>
            LoRAs
          </button>
        </div>
      </SettingsCard>
      <SettingsCard query={query} title="Clear thumbnails" terms="clear delete thumbnail preview">
        <p className="text-xs text-muted">Remove thumbnails only. Types, trigger words, and notes stay.</p>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" className={DANGER} disabled={busy} onClick={() => setPending({ kind: 'checkpoints', action: 'thumbs' })}>
            Base models
          </button>
          <button type="button" className={DANGER} disabled={busy} onClick={() => setPending({ kind: 'loras', action: 'thumbs' })}>
            LoRAs
          </button>
          <button type="button" className={DANGER} disabled={busy} onClick={() => setPending({ kind: 'wildcards', action: 'thumbs' })}>
            Wildcards
          </button>
        </div>
      </SettingsCard>
      <SettingsCard query={query} title="Clear metadata" terms="clear type trigger words prompt">
        <p className="text-xs text-muted">Remove types and LoRA trigger words. Thumbnails and notes stay.</p>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" className={DANGER} disabled={busy} onClick={() => setPending({ kind: 'checkpoints', action: 'meta' })}>
            Base models
          </button>
          <button type="button" className={DANGER} disabled={busy} onClick={() => setPending({ kind: 'loras', action: 'meta' })}>
            LoRAs
          </button>
          <button type="button" className={DANGER} disabled={busy} onClick={() => setPending({ kind: 'wildcards', action: 'meta' })}>
            Wildcards
          </button>
        </div>
      </SettingsCard>
      {pending ? (
        <ConfirmDialog
          title={confirmTitle(pending)}
          body={confirmBody(pending)}
          phrase={PHRASE}
          onClose={() => setPending(null)}
          actions={[
            { label: 'Cancel', onClick: () => setPending(null) },
            {
              label: pending.action === 'thumbs' || pending.action === 'meta' ? 'Clear' : 'Overwrite',
              kind: 'primary',
              onClick: () => {
                const next = pending
                setPending(null)
                if (next.action === 'thumbs' || next.action === 'meta') {
                  void runClear(next.kind, next.action)
                  return
                }
                void runScrape(next.kind, next.action)
              },
            },
          ]}
        />
      ) : null}
    </div>
  )
}

function confirmTitle(pending: Pending) {
  const noun = kindLabel(pending.kind)
  if (pending.action === 'thumbs') {
    return `Clear ${noun} thumbnails?`
  }
  if (pending.action === 'meta') {
    return `Clear ${noun} metadata?`
  }
  if (pending.action === 'full') {
    return `Fully overwrite ${noun}?`
  }
  return `Overwrite ${noun}?`
}

function confirmBody(pending: Pending) {
  const noun = kindLabel(pending.kind)
  if (pending.action === 'thumbs') {
    return `This removes thumbnails for all ${noun}. Types, trigger words, and notes stay. Type ${PHRASE} to unlock.`
  }
  if (pending.action === 'meta') {
    return `This removes types and LoRA trigger words for all ${noun}. Thumbnails and notes stay. Type ${PHRASE} to unlock.`
  }
  if (pending.action === 'full') {
    return `This overwrites Civitai data for all ${noun}, including ones already scraped. Type ${PHRASE} to unlock.`
  }
  return `This fills ${noun} that do not already have a thumbnail. Type ${PHRASE} to unlock.`
}
