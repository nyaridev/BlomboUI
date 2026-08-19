import { RefreshIcon } from '@/components/RefreshIcon.tsx'
import { useIssuesStore } from '@/stores/issuesStore.ts'
import { useModelsStore } from '@/stores/modelsStore.ts'
import { useEffect, useMemo } from 'react'

const KIND_LABEL: Record<string, string> = {
  loras: 'LoRAs',
  wildcards: 'Wildcards',
  checkpoints: 'Checkpoints',
}

const CODE_LABEL: Record<string, string> = {
  duplicate_name: 'Duplicate name',
  duplicate_tag: 'Duplicate header',
  invalid_file: 'Invalid file',
}

export function ErrorsScreen() {
  const items = useIssuesStore((s) => s.items)
  const busy = useIssuesStore((s) => s.busy)
  const load = useIssuesStore((s) => s.load)
  const refreshModels = useModelsStore((s) => s.refresh)
  const modelsBusy = useModelsStore((s) => s.busy)

  useEffect(() => {
    void load()
  }, [load])

  const groups = useMemo(() => {
    const out: { kind: string; items: typeof items }[] = []
    const byKind = new Map<string, typeof items>()
    for (const item of items) {
      const list = byKind.get(item.kind) || []
      list.push(item)
      byKind.set(item.kind, list)
    }
    for (const [kind, rows] of byKind) {
      out.push({ kind, items: rows })
    }
    return out
  }, [items])

  const scanning = busy || modelsBusy

  return (
    <section className="flex max-w-3xl flex-col gap-8">
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
          <RefreshIcon />
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{scanning ? 'Scanning…' : 'No errors found.'}</p>
      ) : (
        groups.map((group) => (
          <section key={group.kind} className="flex flex-col gap-2">
            <h2 className="text-xs font-medium tracking-[0.12em] text-muted uppercase">
              {KIND_LABEL[group.kind] || group.kind}
            </h2>
            <div className="flex flex-col gap-2">
              {group.items.map((item) => (
                <article
                  key={`${item.code}:${item.kind}:${item.name}`}
                  className="overflow-hidden rounded-md border border-line bg-panel"
                >
                  <div className="bg-rose-500/30 px-3 py-2 text-sm font-semibold text-ink">
                    {CODE_LABEL[item.code] || item.code}
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
                        <dt className="text-muted">Files</dt>
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
        ))
      )}
    </section>
  )
}
