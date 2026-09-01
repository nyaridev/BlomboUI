import {
  applyWorkflowModels,
  emptyWorkflowModels,
  snapshotWorkflowModels,
  type WorkflowModels,
} from './workflowModels.ts'

export type ContentParams = {
  prompt: string
  negativePrompt: string
  checkpoint: string
  vae: string
  textEncoder: string
  activeLoraOrder: string[]
  activeLoraStrengths: Record<string, number>
}

export function workflowHasPack(
  paramsByWorkflow: Record<string, unknown>,
  modelsByWorkflow: Record<string, unknown>,
  id: string,
) {
  return Object.hasOwn(paramsByWorkflow, id) || Object.hasOwn(modelsByWorkflow, id)
}

export type WorkflowSwitchState<P extends ContentParams> = P & {
  workflow: string
  paramsByWorkflow: Record<string, P>
  modelsByWorkflow: Record<string, WorkflowModels>
  templateByWorkflow?: Record<string, string>
  templateId?: string
}

export function applySetWorkflow<P extends ContentParams, S extends WorkflowSwitchState<P>>(
  s: S,
  workflow: string,
  defaults: unknown,
  helpers: {
    pickParams: (source: S) => P
    mergeParams: (raw: unknown) => P
  },
): S {
  const has = workflowHasPack(s.paramsByWorkflow, s.modelsByWorkflow, workflow)
  if (workflow === s.workflow && has) {
    return s
  }
  let paramsByWorkflow = s.paramsByWorkflow
  let modelsByWorkflow = s.modelsByWorkflow
  if (workflow !== s.workflow) {
    paramsByWorkflow = { ...s.paramsByWorkflow, [s.workflow]: helpers.pickParams(s) }
    modelsByWorkflow = { ...s.modelsByWorkflow, [s.workflow]: snapshotWorkflowModels(s) }
  }
  const incomingModels = modelsByWorkflow[workflow] ?? emptyWorkflowModels('')
  const incomingParams = paramsByWorkflow[workflow] ?? helpers.mergeParams(defaults)
  return {
    ...s,
    ...incomingParams,
    ...applyWorkflowModels(incomingModels),
    workflow,
    templateId: s.templateByWorkflow?.[workflow] ?? 'default',
    paramsByWorkflow: paramsByWorkflow[workflow]
      ? paramsByWorkflow
      : { ...paramsByWorkflow, [workflow]: incomingParams },
    modelsByWorkflow: modelsByWorkflow[workflow]
      ? modelsByWorkflow
      : { ...modelsByWorkflow, [workflow]: incomingModels },
    swapTarget: null,
  } as S
}

export function hydrateFromPacks<P extends ContentParams, S extends Record<string, unknown>>(
  current: S,
  _rest: Record<string, unknown>,
  paramsByWorkflow: Record<string, P>,
  modelsByWorkflow: Record<string, WorkflowModels>,
  workflow: string,
  extras: Record<string, unknown>,
): S {
  const params = paramsByWorkflow[workflow]
  const models = modelsByWorkflow[workflow] ?? emptyWorkflowModels('')
  return {
    ...current,
    ...extras,
    ...(params ?? {}),
    ...applyWorkflowModels(models),
    workflow,
    paramsByWorkflow,
    modelsByWorkflow,
  } as S
}
