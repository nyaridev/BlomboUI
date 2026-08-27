import { GalleryBrowser } from '@/components/composites/gallery/GalleryBrowser.tsx'
import { useMemo } from 'react'
import type { ModelEntry, ModelLists } from '@/lib/api.ts'
import { useModelsStore } from '@/stores/modelsStore.ts'

export type LocalKindTab = 'all' | 'checkpoints' | 'loras' | 'wildcards' | 'other'

export function LocalModelsPanel({ kind }: { kind: LocalKindTab }) {
  const checkpoints = useModelsStore((s) => s.checkpoints)
  const diffusionModels = useModelsStore((s) => s.diffusion_models)
  const loras = useModelsStore((s) => s.loras)
  const wildcards = useModelsStore((s) => s.wildcards)
  const vaes = useModelsStore((s) => s.vae)
  const textEncoders = useModelsStore((s) => s.text_encoders)
  const upscaleModels = useModelsStore((s) => s.upscale_models)
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
      return [...vaes, ...textEncoders, ...upscaleModels]
    }
    return [...checkpoints, ...loras, ...wildcards]
  }, [checkpoints, diffusionModels, kind, loras, textEncoders, upscaleModels, vaes, wildcards])
  const itemKind = useMemo(() => {
    if (kind === 'loras' || kind === 'wildcards') {
      return undefined
    }
    const loraSet = new Set(loras)
    const wildSet = new Set(wildcards)
    const unetSet = new Set(diffusionModels)
    const teSet = new Set(textEncoders)
    const upscaleSet = new Set(upscaleModels)
    const vaeSet = new Set(vaes)
    return (item: ModelEntry): keyof ModelLists => {
      if (kind === 'checkpoints') {
        return unetSet.has(item) ? 'diffusion_models' : 'checkpoints'
      }
      if (kind === 'other') {
        if (teSet.has(item)) {
          return 'text_encoders'
        }
        if (upscaleSet.has(item)) {
          return 'upscale_models'
        }
        return 'vae'
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
  }, [diffusionModels, kind, loras, textEncoders, upscaleModels, vaes, wildcards])
  const viewKind: keyof ModelLists =
    kind === 'all' || kind === 'checkpoints' ? 'checkpoints' : kind === 'other' ? 'vae' : kind

  return (
    <GalleryBrowser
      kind={viewKind}
      chromeKey={`models-${kind}`}
      items={items}
      itemKind={itemKind}
      fill
      fileOps={kind !== 'all'}
    />
  )
}
