import { ConfirmDialog } from '@/components/primitives/Dialog.tsx'
import { NumberField } from '@/components/primitives/NumberField.tsx'
import { SelectField } from '@/components/primitives/SelectField.tsx'
import {
  civitaiJobBusy,
  clearCivitai,
  scrapeCivitai,
  type ClearKind,
  type ClearMode,
  type ScrapeKind,
  type ScrapeMode,
  type ScrapeScope,
} from '@/lib/civitai/scrape.ts'
import { SettingsCard } from './SettingsBlock.tsx'
import { useToastStore } from '@/stores/toastStore.ts'
import {
  CIVITAI_SITES,
  civitaiHost,
  useSettingsStore,
  type CivitaiSite,
} from '@/stores/settingsStore.ts'
import { useState } from 'react'

export const CIVITAI_ACCOUNT_QUERY =
  'civitai site red com api key account automatic retry attempts search error request'
export const CIVITAI_QUERY =
  'civitai scrape fill missing overwrite force full thumbnail type trigger words checkpoint lora wildcards metadata clear scope all'

export function CivitaiAccountPanel({ query = '' }: { query?: string }) {
  const civitaiSite = useSettingsStore((s) => s.civitaiSite)
  const civitaiApiKey = useSettingsStore((s) => s.civitaiApiKey)
  const autoRetry = useSettingsStore((s) => s.civitaiAutoRetry)
  const autoRetryCount = useSettingsStore((s) => s.civitaiAutoRetryCount)
  const setCivitaiSite = useSettingsStore((s) => s.setCivitaiSite)
  const setCivitaiApiKey = useSettingsStore((s) => s.setCivitaiApiKey)
  const setAutoRetry = useSettingsStore((s) => s.setCivitaiAutoRetry)
  const setAutoRetryCount = useSettingsStore((s) => s.setCivitaiAutoRetryCount)

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <SettingsCard
        query={query}
        title="Civitai"
        terms="preferred civitai site red com links api key account"
        id="settings-civitai"
      >
        <SelectField
          value={civitaiSite}
          onChange={(value) => setCivitaiSite(value as CivitaiSite)}
          options={[...CIVITAI_SITES]}
        />
        <label className="flex flex-col gap-1 text-sm text-ink">
          <span className="text-xs text-muted">API key</span>
          <input
            type="password"
            className="w-full rounded border border-line bg-field px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
            value={civitaiApiKey}
            onChange={(event) => setCivitaiApiKey(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="Optional"
          />
        </label>
        <p className="text-xs text-muted">
          Used for the CivitAI browser on Models → CivitAI.{' '}
          <a
            href={`https://${civitaiHost(civitaiSite)}/user/account`}
            target="_blank"
            rel="noreferrer"
            className="text-purple-bright underline decoration-purple-bright/50 hover:decoration-purple-bright"
          >
            Manage API key
          </a>
        </p>
      </SettingsCard>
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
    </div>
  )
}

const SCRAPE_SCOPES = [
  { value: 'all', label: 'All' },
  { value: 'thumbs', label: 'Thumbnails' },
  { value: 'meta', label: 'Metadata' },
] as const

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

function scopeNoun(noun: string, scope: ScrapeScope) {
  if (scope === 'thumbs') {
    return `${noun} thumbnails`
  }
  if (scope === 'meta') {
    return `${noun} metadata`
  }
  return noun
}

function parseScope(value: string): ScrapeScope {
  if (value === 'thumbs' || value === 'meta') {
    return value
  }
  return 'all'
}

export function CivitaiPanel({ query = '' }: { query?: string }) {
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [scope, setScope] = useState<ScrapeScope>('all')

  async function runScrape(kind: ScrapeKind, action: ScrapeMode) {
    if (busy || civitaiJobBusy()) {
      return
    }
    setBusy(true)
    const ac = new AbortController()
    const store = useToastStore.getState()
    const noun = scopeNoun(kindLabel(kind), scope)
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
      const result = await scrapeCivitai(kind, action, ac.signal, onProgress, scope)
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
      <SettingsCard query={query} title="Scrape scope" terms="scrape scope all thumbnails metadata type trigger">
        <SelectField value={scope} onChange={(value) => setScope(parseScope(value))} options={[...SCRAPE_SCOPES]} />
        <p className="text-xs text-muted">
          What fill and overwrite write. Clear thumbnails and clear metadata below stay separate.
        </p>
      </SettingsCard>
      <SettingsCard query={query} title="Fill missing" terms="scrape fill missing thumbnail type trigger">
        <p className="text-xs text-muted">{fillHint(scope)}</p>
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
        <p className="text-xs text-muted">{forceHint(scope)}</p>
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
        <p className="text-xs text-muted">{fullHint(scope)}</p>
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
          title={confirmTitle(pending, scope)}
          body={confirmBody(pending, scope)}
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

function fillHint(scope: ScrapeScope) {
  if (scope === 'thumbs') {
    return 'Skip models that already have a thumbnail.'
  }
  if (scope === 'meta') {
    return 'Skip models that already have a type or LoRA trigger words.'
  }
  return 'Skip models that already have a thumbnail, type, or LoRA trigger words.'
}

function forceHint(scope: ScrapeScope) {
  if (scope === 'meta') {
    return 'Fill types and trigger words on models that do not already have a thumbnail.'
  }
  return 'Fill models that do not already have a thumbnail. Existing thumbs are left alone.'
}

function fullHint(scope: ScrapeScope) {
  if (scope === 'thumbs') {
    return 'Replace thumbnails for every match, including models already scraped. Types and trigger words stay.'
  }
  if (scope === 'meta') {
    return 'Replace types and trigger words for every match, including models already scraped. Thumbnails stay.'
  }
  return 'Replace Civitai data for every match, including models already scraped.'
}

function confirmTitle(pending: Pending, scope: ScrapeScope) {
  const noun = pending.action === 'thumbs' || pending.action === 'meta' ? kindLabel(pending.kind) : scopeNoun(kindLabel(pending.kind), scope)
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

function confirmBody(pending: Pending, scope: ScrapeScope) {
  if (pending.action === 'thumbs') {
    return `This removes thumbnails for all ${kindLabel(pending.kind)}. Types, trigger words, and notes stay. Type ${PHRASE} to unlock.`
  }
  if (pending.action === 'meta') {
    return `This removes types and LoRA trigger words for all ${kindLabel(pending.kind)}. Thumbnails and notes stay. Type ${PHRASE} to unlock.`
  }
  const noun = scopeNoun(kindLabel(pending.kind), scope)
  if (pending.action === 'full') {
    if (scope === 'thumbs') {
      return `This overwrites thumbnails for all ${kindLabel(pending.kind)}, including ones already scraped. Types and trigger words stay. Type ${PHRASE} to unlock.`
    }
    if (scope === 'meta') {
      return `This overwrites types and trigger words for all ${kindLabel(pending.kind)}, including ones already scraped. Thumbnails stay. Type ${PHRASE} to unlock.`
    }
    return `This overwrites Civitai data for all ${noun}, including ones already scraped. Type ${PHRASE} to unlock.`
  }
  if (scope === 'meta') {
    return `This fills types and trigger words on ${kindLabel(pending.kind)} that do not already have a thumbnail. Type ${PHRASE} to unlock.`
  }
  return `This fills ${noun} that do not already have a thumbnail. Type ${PHRASE} to unlock.`
}
