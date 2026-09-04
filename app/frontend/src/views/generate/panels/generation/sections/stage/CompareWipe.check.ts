import assert from 'node:assert/strict'
import { clampSplit, compareWorkflow, containRect, inputPathCount } from './compareWipe.ts'

assert.equal(compareWorkflow({ workflow: 'background_removal' }), true)
assert.equal(compareWorkflow({ workflow: 'image_upscale' }), true)
assert.equal(compareWorkflow({ workflow_id: 'utils/image_upscale.json' }), true)
assert.equal(compareWorkflow({ workflow: 'image_caption' }), false)
assert.equal(compareWorkflow({ workflow: 'sd15' }), false)
assert.equal(compareWorkflow(null), false)
assert.equal(inputPathCount({ input_paths: ['a.png', 'b.png'] }), 2)
assert.equal(inputPathCount({}), 0)
assert.equal(clampSplit(0), 0.02)
assert.equal(clampSplit(1), 0.98)
assert.equal(clampSplit(0.4), 0.4)
assert.deepEqual(containRect(200, 100, 200, 200), { x: 0, y: 50, w: 200, h: 100 })
assert.deepEqual(containRect(100, 200, 200, 200), { x: 50, y: 0, w: 100, h: 200 })
console.log('CompareWipe.check ok')
