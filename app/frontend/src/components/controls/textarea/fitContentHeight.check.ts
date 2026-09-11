import assert from 'node:assert/strict'
import { fittedHeight } from './fitContentHeight.ts'

assert.equal(fittedHeight(80, 40, 40, 400), 80)
assert.equal(fittedHeight(80, 80, 40, 400), 80)
assert.equal(fittedHeight(80, 120, 40, 400), 120)
assert.equal(fittedHeight(80, 500, 40, 400), 400)
assert.equal(fittedHeight(80, 10, 40, 400), 80)

console.log('fitContentHeight.check ok')
