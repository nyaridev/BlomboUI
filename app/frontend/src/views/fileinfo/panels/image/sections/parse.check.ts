import assert from 'node:assert/strict'
import { DEFAULT_PARAMS, pickParams } from '../../../../../stores/generateStore.ts'
import { applyFixedSeedAfter, applyPngInfo, paramsForGenerate } from './parse.ts'

const text = [
  'a cat, red dress',
  'Negative prompt: blurry',
  'Steps: 20, Sampler: euler, Scheduler: sgm_uniform, CFG scale: 4, Seed: 12345, Size: 512x768, Model: demo.safetensors',
].join('\n')

const parsed = paramsForGenerate(text, null)
assert.equal(parsed.prompt, 'a cat, red dress')
assert.equal(parsed.negativePrompt, 'blurry')
assert.equal(parsed.seed, 12345)
assert.equal(parsed.seedAfter, 'fixed')

const rawMeta = {
  version: 2,
  params: {
    prompt: 'a cat, red dress',
    prompt_raw: 'a cat, __outfit__',
    negative_prompt: 'blurry',
    negative_prompt_raw: 'bad, __neg__',
    models: [],
    hires: { enabled: true },
    adetailer: { enabled: true, units: [{}] },
  },
}
const raw = paramsForGenerate(text, rawMeta)
assert.equal(raw.prompt, 'a cat, __outfit__')
assert.equal(raw.negativePrompt, 'bad, __neg__')
assert.equal(raw.seedAfter, 'fixed')

const current = pickParams(DEFAULT_PARAMS)
current.seedAfter = 'randomize'
current.hires.seedAfter = 'randomize'
current.adetailer.units = [{ ...current.adetailer.units[0], seedAfter: 'randomize' }]
const sent = applyFixedSeedAfter(
  applyPngInfo(current, raw, new Set(['prompt', 'negativePrompt', 'seed', 'seedAfter']), {
    samplers: ['euler'],
    schedulers: ['sgm_uniform'],
  }),
  rawMeta,
)
assert.equal(sent.prompt, 'a cat, __outfit__')
assert.equal(sent.seedAfter, 'fixed')
assert.equal(sent.hires.seedAfter, 'fixed')
assert.equal(sent.adetailer.units[0].seedAfter, 'fixed')

const noExtras = applyFixedSeedAfter(pickParams(DEFAULT_PARAMS), { params: { prompt_raw: 'x' } })
assert.equal(noExtras.seedAfter, 'fixed')
assert.equal(noExtras.hires.seedAfter, DEFAULT_PARAMS.hires.seedAfter)
assert.equal(noExtras.adetailer.units[0].seedAfter, DEFAULT_PARAMS.adetailer.units[0].seedAfter)

console.log('parse.check ok')
