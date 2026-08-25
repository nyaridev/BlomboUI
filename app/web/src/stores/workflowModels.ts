export const AUTO_LORA_PREFIX = 'auto:'

export type WorkflowModels = {
  checkpoint: string
  vae: string
  textEncoder: string
  autoLoraOrder: string[]
  autoLoraStrengths: Record<string, number>
}

export type WorkflowModelLive = {
  workflow: string
  modelsByWorkflow: Record<string, WorkflowModels>
  checkpoint: string
  vae: string
  textEncoder: string
  activeLoraOrder: string[]
  activeLoraStrengths: Record<string, number>
}

function isAutoLoraId(id: string) {
  return id.startsWith(AUTO_LORA_PREFIX)
}

function cleanStrengths(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(raw).filter(
      ([path, value]) => Boolean(path) && typeof value === 'number' && Number.isFinite(value),
    ),
  )
}

export function emptyWorkflowModels(checkpoint: string): WorkflowModels {
  return {
    checkpoint,
    vae: '',
    textEncoder: '',
    autoLoraOrder: [],
    autoLoraStrengths: {},
  }
}

export function snapshotWorkflowModels(source: {
  checkpoint: string
  vae: string
  textEncoder: string
  activeLoraOrder: string[]
  activeLoraStrengths: Record<string, number>
}): WorkflowModels {
  const autoLoraOrder = source.activeLoraOrder.filter(isAutoLoraId)
  const autoLoraStrengths: Record<string, number> = {}
  for (const id of autoLoraOrder) {
    const path = id.slice(AUTO_LORA_PREFIX.length)
    const value = source.activeLoraStrengths[path]
    if (path && typeof value === 'number' && Number.isFinite(value)) {
      autoLoraStrengths[path] = value
    }
  }
  return {
    checkpoint: source.checkpoint,
    vae: source.vae,
    textEncoder: source.textEncoder,
    autoLoraOrder,
    autoLoraStrengths,
  }
}

export function applyWorkflowModels(
  models: WorkflowModels,
  activeLoraOrder: string[],
  activeLoraStrengths: Record<string, number>,
) {
  const promptIds = activeLoraOrder.filter((id) => !isAutoLoraId(id))
  return {
    checkpoint: models.checkpoint,
    vae: models.vae,
    textEncoder: models.textEncoder,
    activeLoraOrder: [...models.autoLoraOrder, ...promptIds],
    activeLoraStrengths: { ...activeLoraStrengths, ...models.autoLoraStrengths },
  }
}

export function parseWorkflowModels(raw: unknown, fallbackCheckpoint: string): WorkflowModels | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const row = raw as Record<string, unknown>
  const autoLoraOrder = Array.isArray(row.autoLoraOrder)
    ? [...new Set(row.autoLoraOrder.filter((id): id is string => typeof id === 'string' && isAutoLoraId(id) && id.length > AUTO_LORA_PREFIX.length))]
    : []
  return {
    checkpoint: typeof row.checkpoint === 'string' ? row.checkpoint : fallbackCheckpoint,
    vae: typeof row.vae === 'string' ? row.vae : '',
    textEncoder: typeof row.textEncoder === 'string' ? row.textEncoder : '',
    autoLoraOrder,
    autoLoraStrengths: cleanStrengths(row.autoLoraStrengths),
  }
}

export function parseModelsByWorkflow(raw: unknown, fallbackCheckpoint: string): Record<string, WorkflowModels> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const out: Record<string, WorkflowModels> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const name = key.trim()
    if (!name) {
      continue
    }
    const parsed = parseWorkflowModels(value, fallbackCheckpoint)
    if (parsed) {
      out[name] = parsed
    }
  }
  return out
}

export function patchWorkflowModels(
  state: WorkflowModelLive,
  patch: Partial<Omit<WorkflowModelLive, 'workflow' | 'modelsByWorkflow'>>,
) {
  const next = {
    checkpoint: patch.checkpoint ?? state.checkpoint,
    vae: patch.vae ?? state.vae,
    textEncoder: patch.textEncoder ?? state.textEncoder,
    activeLoraOrder: patch.activeLoraOrder ?? state.activeLoraOrder,
    activeLoraStrengths: patch.activeLoraStrengths ?? state.activeLoraStrengths,
  }
  return {
    ...patch,
    modelsByWorkflow: {
      ...state.modelsByWorkflow,
      [state.workflow]: snapshotWorkflowModels(next),
    },
  }
}
