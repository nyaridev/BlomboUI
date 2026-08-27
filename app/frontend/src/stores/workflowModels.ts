export const AUTO_LORA_PREFIX = 'auto:'

export type WorkflowModels = {
  checkpoint: string
  vae: string
  textEncoder: string
  activeLoraOrder: string[]
  activeLoraStrengths: Record<string, number>
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

function cleanOrder(raw: unknown): string[] {
  return Array.isArray(raw)
    ? [...new Set(raw.filter((item): item is string => typeof item === 'string' && Boolean(item)))]
    : []
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
    activeLoraOrder: [],
    activeLoraStrengths: {},
  }
}

export function snapshotWorkflowModels(source: {
  checkpoint: string
  vae: string
  textEncoder: string
  activeLoraOrder: string[]
  activeLoraStrengths: Record<string, number>
}): WorkflowModels {
  const activeLoraOrder = cleanOrder(source.activeLoraOrder)
  const activeLoraStrengths: Record<string, number> = {}
  for (const id of activeLoraOrder) {
    const path = isAutoLoraId(id) ? id.slice(AUTO_LORA_PREFIX.length) : id
    const value = source.activeLoraStrengths[path] ?? source.activeLoraStrengths[id]
    if (path && typeof value === 'number' && Number.isFinite(value)) {
      activeLoraStrengths[path] = value
    }
  }
  return {
    checkpoint: source.checkpoint,
    vae: source.vae,
    textEncoder: source.textEncoder,
    activeLoraOrder,
    activeLoraStrengths,
  }
}

export function applyWorkflowModels(models: WorkflowModels) {
  return {
    checkpoint: models.checkpoint,
    vae: models.vae,
    textEncoder: models.textEncoder,
    activeLoraOrder: [...models.activeLoraOrder],
    activeLoraStrengths: { ...models.activeLoraStrengths },
  }
}

export function parseWorkflowModels(raw: unknown, fallbackCheckpoint: string): WorkflowModels | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const row = raw as Record<string, unknown>
  const activeLoraOrder = cleanOrder(row.activeLoraOrder).length
    ? cleanOrder(row.activeLoraOrder)
    : cleanOrder(row.autoLoraOrder)
  return {
    checkpoint: typeof row.checkpoint === 'string' ? row.checkpoint : fallbackCheckpoint,
    vae: typeof row.vae === 'string' ? row.vae : '',
    textEncoder: typeof row.textEncoder === 'string' ? row.textEncoder : '',
    activeLoraOrder,
    activeLoraStrengths: {
      ...cleanStrengths(row.autoLoraStrengths),
      ...cleanStrengths(row.activeLoraStrengths),
    },
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
