import { AUTO_LORA_PREFIX } from '@/stores/workflowModels.ts'
import type { TemplateParams } from '@/stores/generateStore.ts'

export function toggleSkip(list: string[], id: string) {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id]
}

export function readyTemplateParams(params: TemplateParams): TemplateParams {
  const skipLora = new Set(params.skippedLoras ?? [])
  return {
    ...params,
    activeLoraOrder: params.activeLoraOrder.filter((id) => !id.startsWith(AUTO_LORA_PREFIX) || !skipLora.has(id)),
  }
}
