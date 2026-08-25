import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { isLoggedIssue, useIssuesStore } from '@/stores/issuesStore.ts'
import { useModelsStore } from '@/stores/modelsStore.ts'
import { useEffect, useMemo, useState } from 'react'
import type { GuiIssue } from '@/lib/api.ts'

const KIND_LABEL: Record<string, string> = {
  loras: 'LoRAs',
  wildcards: 'Wildcards',
  checkpoints: 'Checkpoints',
  models: 'Models',
  gallery: 'Gallery',
  scopes: 'Scopes',
  civitai: 'Civitai',
}

const CODE_LABEL: Record<string, string> = {
  duplicate_name: 'Duplicate name',
  duplicate_tag: 'Duplicate header',
  invalid_file: 'Invalid file',
  duplicate_dir: 'Duplicate directory',
  missing_dir: 'Missing directory',
  download_failed: 'Download failed',
}

type Pane = 'errors' | 'logs'

const COUNT_BADGE =
  'inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red px-1 text-[10px] leading-none tabular-nums text-ink'

function pathsLabel(kind: string) {
  if (kind === 'scopes') {
    return 'Scopes'
  }
  if (kind === 'civitai') {
    return 'IDs'
  }
  return 'Files'
}

function categoryClass(on: boolean) {
  return [
    'flex h-8 flex-1 items-center justify-center gap-1.5 rounded border text-sm',
    on ? 'border-accent bg-accent text-ink' : 'border-line bg-field text-muted hover:text-ink',
  ].join(' ')
}

function groupByKind(items: GuiIssue[]) {
  const out: { kind: string; items: GuiIssue[] }[] = []
  const byKind = new Map<string, GuiIssue[]>()
  for (const item of items) {
    const list = byKind.get(item.kind) || []
    list.push(item)
    byKind.set(item.kind, list)
  }
  for (const [kind, rows] of byKind) {
    out.push({ kind, items: rows })
  }
  return out
}

export function ErrorsScreen() {
  const items = useIssuesStore((s) => s.items)
  const busy = useIssuesStore((s) => s.busy)
  const seenLogId = useIssuesStore((s) => s.seenLogId)
  const load = useIssuesStore((s) => s.load)
  const dismiss = useIssuesStore((s) => s.dismiss)
  const dismissLog = useIssuesStore((s) => s.dismissLog)
  const markLogsSeen = useIssuesStore((s) => s.markLogsSeen)
  const refreshModels = useModelsStore((s) => s.refresh)
  const modelsBusy = useModelsStore((s) => s.busy)
  const [pane, setPane] = useState<Pane>('errors')
  const errors = useMemo(() => items.filter((item) => !isLoggedIssue(item)), [items])
  const logs = useMemo(() => items.filter(isLoggedIssue), [items])
  const groups = useMemo(() => groupByKind(pane === 'logs' ? logs : errors), [pane, errors, logs])
  const unreadLogs = logs.filter((item) => (item.id ?? 0) > seenLogId).length
  const scanning = busy || modelsBusy

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (pane !== 'logs') {
      return
    }
    markLogsSeen()
  }, [pane, logs, markLogsSeen])

  return (
    <section className="flex h-full min-h-0 flex-col px-10 py-4">
      <div className="mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">Errors</h1>
          <button
            type="button"
            className="icon-btn"
            aria-label="Rescan"
            title="Rescan"
            disabled={scanning}
            onClick={() => void refreshModels()}
          >
            <AppIcon id="refresh-cw" />
          </button>
          {pane === 'logs' && logs.length ? (
            <button
              type="button"
              className="icon-btn"
              aria-label="Clear logs"
              title="Clear logs"
              disabled={busy}
              onClick={() => void dismissLog()}
            >
              <AppIcon id="eraser" />
            </button>
          ) : null}
        </div>
        <div className="mt-3 flex h-8 shrink-0 gap-1">
          <button type="button" className={categoryClass(pane === 'errors')} onClick={() => setPane('errors')}>
            Errors
            {errors.length > 0 ? <span className={COUNT_BADGE}>{errors.length}</span> : null}
          </button>
          <button
            type="button"
            className={categoryClass(pane === 'logs')}
            onClick={() => {
              setPane('logs')
              markLogsSeen()
            }}
          >
            Logs
            {unreadLogs > 0 ? <span className={COUNT_BADGE}>{unreadLogs}</span> : null}
          </button>
        </div>
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {groups.length === 0 ? (
            <p className="text-sm text-muted">
              {pane === 'logs' ? 'No logs yet.' : scanning ? 'Scanning…' : 'No errors found.'}
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {groups.map((group) => (
                <section key={group.kind} className="flex flex-col gap-2">
                  <h2 className="text-xs font-medium tracking-[0.12em] text-muted uppercase">
                    {KIND_LABEL[group.kind] || group.kind}
                  </h2>
                  <div className="flex flex-col gap-2">
                    {group.items.map((item) => (
                      <article
                        key={item.id ?? `${item.code}:${item.kind}:${item.name}:${item.paths.join('|')}`}
                        className="overflow-hidden rounded-md border border-line bg-panel"
                      >
                        <div className="flex items-center gap-2 bg-red/30 px-3 py-2">
                          <p className="min-w-0 flex-1 text-sm font-semibold leading-5 text-ink">
                            {CODE_LABEL[item.code] || item.code}
                          </p>
                          {pane === 'logs' && item.id != null ? (
                            <button
                              type="button"
                              className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-line bg-field text-ink hover:bg-line"
                              aria-label="Dismiss"
                              title="Dismiss"
                              onClick={() => {
                                if (item.id == null) {
                                  return
                                }
                                void dismiss(item.id)
                              }}
                            >
                              <AppIcon id="x" size={12} />
                            </button>
                          ) : null}
                        </div>
                        <dl className="divide-y divide-line text-sm">
                          <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2 px-3 py-1.5">
                            <dt className="text-muted">Name</dt>
                            <dd className="font-mono text-ink">{item.name}</dd>
                          </div>
                          {item.message ? (
                            <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2 px-3 py-1.5">
                              <dt className="text-muted">Detail</dt>
                              <dd className="font-mono text-xs whitespace-pre-wrap text-ink">{item.message}</dd>
                            </div>
                          ) : null}
                          {item.paths.length ? (
                            <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2 px-3 py-1.5">
                              <dt className="text-muted">{pathsLabel(item.kind)}</dt>
                              <dd className="font-mono text-xs text-ink">
                                <ul className="flex flex-col gap-0.5">
                                  {item.paths.map((path) => (
                                    <li key={path}>{path}</li>
                                  ))}
                                </ul>
                              </dd>
                            </div>
                          ) : null}
                        </dl>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
