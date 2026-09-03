import assert from 'node:assert/strict'
import {
  applySetWorkflow,
  hydrateFromPacks,
  reorderId,
  toggleId,
  workflowHasPack,
  type ContentParams,
} from './generatePersist.ts'
import { emptyWorkflowModels } from './workflowModels.ts'

const base: ContentParams = {
  prompt: '1girl, black hair',
  negativePrompt: 'bad',
  checkpoint: 'old.safetensors',
  vae: 'vae.safetensors',
  textEncoder: 'clip.safetensors',
  activeLoraOrder: ['style.safetensors'],
  activeLoraStrengths: { 'style.safetensors': 0.8 },
}

function pack(extra: Partial<ContentParams> & { sampler?: string; steps?: number } = {}) {
  return { ...base, sampler: 'euler', steps: 20, ...extra }
}

assert.equal(workflowHasPack({}, {}, 'sd15'), false)
assert.equal(workflowHasPack({ sd15: base }, {}, 'sd15'), true)
assert.equal(workflowHasPack({}, { anima: emptyWorkflowModels('') }, 'anima'), true)
assert.deepEqual(toggleId([], 'sd15'), ['sd15'])
assert.deepEqual(toggleId(['sd15', 'anima'], 'sd15'), ['anima'])
assert.deepEqual(toggleId(['sd15'], 'anima'), ['anima', 'sd15'])
assert.deepEqual(reorderId(['a', 'b', 'c'], 'c', 'a', true), ['c', 'a', 'b'])
assert.deepEqual(reorderId(['a', 'b', 'c'], 'a', 'c', false), ['b', 'c', 'a'])
assert.deepEqual(reorderId(['a', 'b', 'c'], 'a', 'a', true), ['a', 'b', 'c'])

type Live = ContentParams & {
  workflow: string
  sampler: string
  paramsByWorkflow: Record<string, ContentParams & { sampler: string }>
  modelsByWorkflow: Record<string, ReturnType<typeof emptyWorkflowModels>>
  templateByWorkflow: Record<string, string>
  templateId: string
}

const liveA: Live = {
  ...pack({ prompt: 'from A', activeLoraOrder: ['a.safetensors'] }),
  sampler: 'euler',
  workflow: 'sd15',
  paramsByWorkflow: {},
  modelsByWorkflow: {},
  templateByWorkflow: { sd15: 'default' },
  templateId: 'default',
}

const helpers = {
  pickParams: (source: Live) => pack({ prompt: source.prompt, activeLoraOrder: source.activeLoraOrder, sampler: source.sampler }),
  mergeParams: (raw: unknown) =>
    pack({
      prompt: '',
      checkpoint: '',
      activeLoraOrder: [],
      sampler: typeof raw === 'object' && raw && 'sampler' in raw ? String((raw as { sampler: string }).sampler) : 'euler',
      steps: typeof raw === 'object' && raw && 'steps' in raw ? Number((raw as { steps: number }).steps) : 20,
    }),
}

const toB = applySetWorkflow(liveA, 'anima', { sampler: 'dpmpp_sde', steps: 20 }, helpers)
assert.equal(toB.workflow, 'anima')
assert.equal(toB.prompt, '')
assert.deepEqual(toB.activeLoraOrder, [])
assert.equal(toB.checkpoint, '')
assert.equal(toB.sampler, 'dpmpp_sde')
assert.equal(toB.paramsByWorkflow.sd15.prompt, 'from A')
assert.deepEqual(toB.paramsByWorkflow.sd15.activeLoraOrder, ['a.safetensors'])
assert.deepEqual(toB.modelsByWorkflow.anima.activeLoraOrder, [])

const sameSeed = applySetWorkflow(
  { ...liveA, paramsByWorkflow: {}, modelsByWorkflow: {} },
  'sd15',
  { sampler: 'dpmpp_sde', steps: 28 },
  helpers,
)
assert.equal(sameSeed.sampler, 'dpmpp_sde')
assert.equal(sameSeed.prompt, '')
assert.deepEqual(sameSeed.activeLoraOrder, [])

const sameSkip = applySetWorkflow(
  { ...liveA, paramsByWorkflow: { sd15: pack({ sampler: 'euler' }) }, modelsByWorkflow: { sd15: emptyWorkflowModels('') } },
  'sd15',
  { sampler: 'dpmpp_sde' },
  helpers,
)
assert.equal(sameSkip.sampler, 'euler')
assert.equal(sameSkip.prompt, 'from A')

const hydrated = hydrateFromPacks(
  { prompt: 'DEFAULT', sampler: 'euler', workflow: 'sd15' },
  { prompt: 'LEAK', activeLoraOrder: ['leak.safetensors'] },
  { anima: pack({ prompt: 'anima prompt', sampler: 'dpmpp_sde' }) },
  { anima: { checkpoint: 'krea.safetensors', vae: '', textEncoder: '', activeLoraOrder: ['k.safetensors'], activeLoraStrengths: {} } },
  'anima',
  { modelTileStyle: 'tall' },
)
assert.equal(hydrated.prompt, 'anima prompt')
assert.equal(hydrated.sampler, 'dpmpp_sde')
assert.equal(hydrated.checkpoint, 'krea.safetensors')
assert.deepEqual(hydrated.activeLoraOrder, ['k.safetensors'])
assert.equal(hydrated.workflow, 'anima')

const firstVisit = hydrateFromPacks(
  { prompt: '', sampler: 'euler', workflow: 'sd15', checkpoint: '', activeLoraOrder: [] as string[] },
  { prompt: 'LEAK', activeLoraOrder: ['leak.safetensors'] },
  {},
  {},
  'krea2',
  {},
)
assert.equal(firstVisit.prompt, '')
assert.deepEqual(firstVisit.activeLoraOrder, [])
assert.equal(firstVisit.checkpoint, '')

console.log('generatePersist.check ok')
