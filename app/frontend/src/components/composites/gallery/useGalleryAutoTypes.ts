import { EMPTY_TYPES, isOtherKind } from '@/components/composites/gallery/galleryUtils.ts'
import { matchModelType } from '@/lib/modelTypes.ts'
import { useGenerateStore } from '@/stores/generateStore.ts'
import { modelPath, useModelsStore } from '@/stores/modelsStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useEffect, useMemo } from 'react'
import type { ModelEntry } from '@/lib/api.ts'

const EMPTY_MODELS: ModelEntry[] = []

function sameList(left: string[], right: string[]) {
  return left.length === right.length && left.every((item, i) => item === right[i])
}

function autoArchTypes(raw: string[], hidden: string[]) {
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const type = matchModelType(item)
    if (!type || hidden.includes(type) || seen.has(type)) {
      continue
    }
    seen.add(type)
    out.push(type)
  }
  return out
}

export function useGalleryAutoTypes(
  generate: boolean,
  filterKey: string,
  autoType: boolean,
  setGalleryTypes: (key: string, value: string[]) => void,
  checkpointOverride?: string,
): string[] | null {
  const storeCheckpoint = useGenerateStore((s) => (generate ? s.checkpoint : ''))
  const checkpoint = checkpointOverride ?? storeCheckpoint
  const persist = checkpointOverride == null
  const checkpoints = useModelsStore((s) => (generate ? s.checkpoints : EMPTY_MODELS))
  const diffusionModels = useModelsStore((s) => (generate ? s.diffusion_models : EMPTY_MODELS))
  const hiddenModelTypes = useSettingsStore((s) => s.hiddenModelTypes)
  const storedTypes = useSettingsStore((s) => s.galleryTypes[filterKey] ?? EMPTY_TYPES)
  const checkpointTypes = useMemo(() => {
    const item = [...checkpoints, ...diffusionModels].find((row) => modelPath(row) === checkpoint)
    return item?.types ?? EMPTY_TYPES
  }, [checkpoint, checkpoints, diffusionModels])
  const overlay = useMemo(
    () => [...storedTypes.filter(isOtherKind), ...autoArchTypes(checkpointTypes, hiddenModelTypes)],
    [checkpointTypes, hiddenModelTypes, storedTypes],
  )

  useEffect(() => {
    if (!generate || !autoType || !persist) {
      return
    }
    const current = useSettingsStore.getState().galleryTypes[filterKey] ?? EMPTY_TYPES
    const kinds = current.filter(isOtherKind)
    const next = [...kinds, ...autoArchTypes(checkpointTypes, hiddenModelTypes)]
    if (sameList(current, next)) {
      return
    }
    setGalleryTypes(filterKey, next)
  }, [autoType, checkpointTypes, filterKey, generate, hiddenModelTypes, persist, setGalleryTypes])

  if (!generate || !autoType || persist) {
    return null
  }
  return overlay
}
