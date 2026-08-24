import { GalleryView } from '@/components/gallery/GalleryView.tsx'
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
  { id: 'other', label: 'Other' },
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
  const diffusionModels = useModelsStore((s) => s.diffusion_models)
  const loras = useModelsStore((s) => s.loras)
  const wildcards = useModelsStore((s) => s.wildcards)
  const vaes = useModelsStore((s) => s.vae)
  const textEncoders = useModelsStore((s) => s.text_encoders)
  const items = useMemo(() => {
    if (kind === 'checkpoints') {
      return [...checkpoints, ...diffusionModels]
    }
    if (kind === 'loras') {
      return loras
    }
    if (kind === 'wildcards') {
      return wildcards
    }
    if (kind === 'other') {
      return [...vaes, ...textEncoders]
    }
    return [...checkpoints, ...loras, ...wildcards]
  }, [checkpoints, diffusionModels, kind, loras, textEncoders, vaes, wildcards])
  const itemKind = useMemo(() => {
    if (kind === 'loras' || kind === 'wildcards') {
      return undefined
    }
    const loraSet = new Set(loras)
    const wildSet = new Set(wildcards)
    const unetSet = new Set(diffusionModels)
    const teSet = new Set(textEncoders)
    const vaeSet = new Set(vaes)
    return (item: ModelEntry): keyof ModelLists => {
      if (kind === 'checkpoints') {
        return unetSet.has(item) ? 'diffusion_models' : 'checkpoints'
      }
      if (kind === 'other') {
        return teSet.has(item) ? 'text_encoders' : 'vae'
      }
      if (loraSet.has(item)) {
        return 'loras'
      }
      if (wildSet.has(item)) {
        return 'wildcards'
      }
      if (vaeSet.has(item)) {
        return 'vae'
      }
      return 'checkpoints'
    }
  }, [diffusionModels, kind, loras, textEncoders, vaes, wildcards])
  const viewKind: keyof ModelLists =
    kind === 'all' || kind === 'checkpoints' ? 'checkpoints' : kind === 'other' ? 'vae' : kind

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
