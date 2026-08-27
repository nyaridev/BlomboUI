import { ButtonControl } from '@/components/controls/button/ButtonControl.tsx'
import { listManagerModels, installManagerModel, type ManagerModel } from '@/lib/api/manager.ts'
import { useDownloadsStore } from '@/stores/downloadsStore.ts'
import { useModelsStore } from '@/stores/modelsStore.ts'
import { ManagerErrorState } from '@/views/models/panels/manager/sections/ManagerErrorState.tsx'
import { ManagerFilters } from '@/views/models/panels/manager/sections/ManagerFilters.tsx'
import { ManagerTable, rowKey } from '@/views/models/panels/manager/sections/ManagerTable.tsx'
import { useCallback, useEffect, useMemo, useState } from 'react'

const SEARCH_KEYS: (keyof ManagerModel)[] = ['name', 'type', 'base', 'description', 'filename', 'save_path']

function matchesQuery(item: ManagerModel, query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return true
  }
  return SEARCH_KEYS.some((key) => String(item[key] || '').toLowerCase().includes(needle))
}

export function ManagerPanel() {
  const pull = useModelsStore((state) => state.pull)
  const active = useDownloadsStore((state) => state.active)
  const loadDownloads = useDownloadsStore((state) => state.load)
  const [items, setItems] = useState<ManagerModel[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [type, setType] = useState('all')
  const [base, setBase] = useState('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [installing, setInstalling] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      setItems(await listManagerModels())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Manager catalog.')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!installing.size) {
      return
    }
    const timer = window.setInterval(() => {
      void loadDownloads({ silent: true })
    }, 500)
    return () => window.clearInterval(timer)
  }, [installing, loadDownloads])

  const types = useMemo(() => [...new Set(items.map((item) => item.type).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [items])
  const bases = useMemo(() => [...new Set(items.map((item) => item.base).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [items])

  const shown = useMemo(() => {
    return items.filter((item) => {
      if (filter === 'installed' && item.installed !== 'True') {
        return false
      }
      if (filter === 'not_installed' && item.installed !== 'False') {
        return false
      }
      if (type !== 'all' && item.type !== type) {
        return false
      }
      if (base !== 'all' && item.base !== base) {
        return false
      }
      return matchesQuery(item, query)
    })
  }, [items, filter, type, base, query])

  const visibleSelected = shown.filter((item) => selected.has(rowKey(item)) && item.installed !== 'True')

  const progress = useMemo(() => {
    const out: Record<string, number> = {}
    for (const item of shown) {
      const key = rowKey(item)
      if (!installing.has(key)) {
        continue
      }
      const job = active.find((row) => row.fileName === item.filename)
      if (!job) {
        continue
      }
      const total = job.sizeBytes || 0
      out[key] = total ? Math.min(100, (job.bytesDone / total) * 100) : 0
    }
    return out
  }, [shown, installing, active])

  async function installOne(item: ManagerModel) {
    const key = rowKey(item)
    setInstalling((current) => new Set(current).add(key))
    try {
      await installManagerModel(item)
      await pull()
      await load()
      setSelected((current) => {
        const next = new Set(current)
        next.delete(key)
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Install failed.')
    } finally {
      setInstalling((current) => {
        const next = new Set(current)
        next.delete(key)
        return next
      })
    }
  }

  async function installSelected() {
    const pending = visibleSelected
    for (const item of pending) {
      await installOne(item)
    }
  }

  if (error && !items.length) {
    return <ManagerErrorState message={error} onRetry={() => void load()} busy={busy} />
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-stack">
      <ManagerFilters
        filter={filter}
        type={type}
        base={base}
        query={query}
        types={types}
        bases={bases}
        onFilter={setFilter}
        onType={setType}
        onBase={setBase}
        onQuery={setQuery}
      />
      {error ? <p className="text-sm text-red-bright">{error}</p> : null}
      <div className="flex h-toolbar shrink-0 items-center gap-cluster">
        <p className="text-xs text-muted">{shown.length.toLocaleString()} external models</p>
        {visibleSelected.length ? (
          <ButtonControl tone="accent" size="sm" disabled={Boolean(installing.size)} onClick={() => void installSelected()}>
            Install {visibleSelected.length} selected
          </ButtonControl>
        ) : null}
      </div>
      {busy && !items.length ? (
        <p className="p-4 text-sm text-muted">Loading external model list…</p>
      ) : (
        <ManagerTable
          items={shown}
          selected={selected}
          installing={installing}
          progress={progress}
          onToggle={(key, on) => {
            setSelected((current) => {
              const next = new Set(current)
              if (on) {
                next.add(key)
              } else {
                next.delete(key)
              }
              return next
            })
          }}
          onToggleAll={(on) => {
            setSelected((current) => {
              const next = new Set(current)
              for (const item of shown) {
                if (item.installed === 'True') {
                  continue
                }
                const key = rowKey(item)
                if (on) {
                  next.add(key)
                } else {
                  next.delete(key)
                }
              }
              return next
            })
          }}
          onInstall={(item) => void installOne(item)}
        />
      )}
    </div>
  )
}
