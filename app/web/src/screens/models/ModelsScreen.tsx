import { GalleryView } from '@/components/GalleryView.tsx'
import { CivitaiBrowser } from './CivitaiBrowser.tsx'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useModelsStore } from '@/stores/modelsStore.ts'
import { useMemo } from 'react'
import type { ModelEntry, ModelLists } from '@/lib/api.ts'

const PAGE_TABS = ['Local', 'CivitAI'] as const
const KIND_TABS = [
  { id: 'all', label: 'All' },
  { id: 'checkpoints', label: 'Base Model' },
  { id: 'loras', label: 'LoRA' },
  { id: 'wildcards', label: 'Wildcards' },
] as const

type PageTab = (typeof PAGE_TABS)[number]
type KindTab = (typeof KIND_TABS)[number]['id']

function tabClass(on: boolean) {
  return [
    '-mb-px rounded-t-md border px-3 py-1.5 text-sm',
    on ? 'border-line border-b-panel bg-panel text-ink' : 'border-transparent text-muted hover:text-ink',
  ].join(' ')
}

function LocalModels({ kind }: { kind: KindTab }) {
  const checkpoints = useModelsStore((s) => s.checkpoints)
  const loras = useModelsStore((s) => s.loras)
  const wildcards = useModelsStore((s) => s.wildcards)
  const items = useMemo(() => {
    if (kind === 'checkpoints') {
      return checkpoints
    }
    if (kind === 'loras') {
      return loras
    }
    if (kind === 'wildcards') {
      return wildcards
    }
    return [...checkpoints, ...loras, ...wildcards]
  }, [checkpoints, kind, loras, wildcards])
  const itemKind = useMemo(() => {
    if (kind !== 'all') {
      return undefined
    }
    const loraSet = new Set(loras)
    const wildSet = new Set(wildcards)
    return (item: ModelEntry): keyof ModelLists => {
      if (loraSet.has(item)) {
        return 'loras'
      }
      if (wildSet.has(item)) {
        return 'wildcards'
      }
      return 'checkpoints'
    }
  }, [kind, loras, wildcards])
  const viewKind = kind === 'all' ? 'checkpoints' : kind

  return (
    <GalleryView
      kind={viewKind}
      chromeKey={`models-${kind}`}
      items={items}
      itemKind={itemKind}
      fill
      fileOps={kind !== 'all'}
    />
  )
}

export function ModelsScreen() {
  const tab = useSettingsStore((s) => s.modelsTab)
  const setTab = useSettingsStore((s) => s.setModelsTab)
  const kind = useSettingsStore((s) => s.modelsKind)
  const setKind = useSettingsStore((s) => s.setModelsKind)
  const page = PAGE_TABS.includes(tab as PageTab) ? (tab as PageTab) : 'Local'
  const shownKind = KIND_TABS.some((item) => item.id === kind) ? kind : 'all'

  return (
    <div className="flex h-full min-h-0 flex-col px-10 py-4">
      <div className="flex shrink-0 gap-1">
        {PAGE_TABS.map((item) => (
          <button key={item} type="button" className={tabClass(page === item)} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col rounded-b-md rounded-tr-md border border-line bg-panel p-3">
        {page === 'CivitAI' ? (
          <CivitaiBrowser />
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="mb-2 flex shrink-0 gap-1">
              {KIND_TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={[
                    'rounded border px-2 py-1 text-xs',
                    shownKind === item.id
                      ? 'border-accent bg-accent text-ink'
                      : 'border-line bg-field text-muted hover:text-ink',
                  ].join(' ')}
                  onClick={() => setKind(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1">
              <LocalModels kind={shownKind} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
