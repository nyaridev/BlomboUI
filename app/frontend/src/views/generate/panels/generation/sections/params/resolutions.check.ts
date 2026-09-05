import assert from 'node:assert/strict'
import { inferScaler, sizeFromScaler } from './resolutions.ts'

const square = sizeFromScaler('1:1', 1.5)
assert.equal(square.width, 1256)
assert.equal(square.height, 1256)

const portrait = sizeFromScaler('3:4', 1.5)
assert.equal(portrait.width, 1088)
assert.equal(portrait.height, 1448)

const inferred = inferScaler(1256, 1256)
assert.equal(inferred.aspect, '1:1')
assert.equal(inferred.megapixels, 1.5)

console.log('resolutions.check ok')
