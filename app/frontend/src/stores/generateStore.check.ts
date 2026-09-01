import assert from 'node:assert/strict'
import {
  applyOf,
  DEFAULT_APPLY,
  DEFAULT_PARAMS,
  mixParams,
  pickParams,
  templateApplyFields,
} from './generateStore.ts'

const current = pickParams(DEFAULT_PARAMS)
current.adetailer.enabled = false
current.adetailer.units = [{ ...current.adetailer.units[0], detector: 'keep.pt', steps: 20 }]

const incoming = pickParams(DEFAULT_PARAMS)
incoming.adetailer.enabled = true
incoming.adetailer.units = [
  { ...incoming.adetailer.units[0], detector: 'face.pt', steps: 40 },
  { ...incoming.adetailer.units[0], id: 'u2', name: 'Two', detector: 'hand.pt', steps: 12 },
]

const stepsOnly = mixParams(current, incoming, ['adetailerSteps'])
assert.equal(stepsOnly.adetailer.enabled, true)
assert.equal(stepsOnly.adetailer.units[0].steps, 40)
assert.equal(stepsOnly.adetailer.units[0].detector, 'keep.pt')
assert.equal(stepsOnly.adetailer.units.length, 2)
assert.equal(stepsOnly.adetailer.units[1].steps, 12)
assert.equal(stepsOnly.adetailer.units[1].detector, '')

const expanded = applyOf(['adetailer'])
assert.ok(expanded.includes('adetailerSteps'))
assert.ok(expanded.includes('adetailerDetector'))
assert.ok(!expanded.includes('adetailer'))
assert.ok(DEFAULT_APPLY.includes('adetailerSteps'))
assert.ok(!DEFAULT_APPLY.includes('adetailer'))

const full = mixParams(current, incoming, expanded)
assert.equal(full.adetailer.units[0].detector, 'face.pt')
assert.equal(full.adetailer.units[1].detector, 'hand.pt')

const visible = templateApplyFields(['hires']).map((field) => field.id)
assert.ok(visible.includes('adetailerSteps'))
assert.ok(visible.includes('hiresSteps'))
assert.ok(!visible.includes('rembgEngine'))

const hiresCurrent = pickParams(DEFAULT_PARAMS)
hiresCurrent.hires.enabled = false
hiresCurrent.hires.steps = 20
hiresCurrent.hires.denoise = 0.4
const hiresIncoming = pickParams(DEFAULT_PARAMS)
hiresIncoming.hires.enabled = true
hiresIncoming.hires.steps = 40
hiresIncoming.hires.denoise = 0.8
const hiresStepsOnly = mixParams(hiresCurrent, hiresIncoming, ['hiresSteps'])
assert.equal(hiresStepsOnly.hires.enabled, true)
assert.equal(hiresStepsOnly.hires.steps, 40)
assert.equal(hiresStepsOnly.hires.denoise, 0.4)

const hiresExpanded = applyOf(['hires'])
assert.ok(hiresExpanded.includes('hiresSteps'))
assert.ok(hiresExpanded.includes('hiresModel'))
assert.ok(!hiresExpanded.includes('hires'))
assert.ok(DEFAULT_APPLY.includes('hiresSteps'))
assert.ok(!DEFAULT_APPLY.includes('hires'))

console.log('generateStore.check ok')
