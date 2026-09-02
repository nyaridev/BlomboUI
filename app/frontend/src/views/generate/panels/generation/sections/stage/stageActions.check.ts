import assert from 'node:assert/strict'
import { dirname, filenameFromPath, outputDirForCurrent, outputPathForCurrent } from './stageActions.ts'

assert.equal(dirname('A:\\out\\image_caption\\2026-09-02\\000001.png'), 'A:\\out\\image_caption\\2026-09-02')
assert.equal(dirname('/user/output/image_upscale/2026-09-02/000001.png'), '/user/output/image_upscale/2026-09-02')
assert.equal(filenameFromPath('A:\\out\\override\\result.jpg'), 'result.jpg')
assert.equal(filenameFromPath(''), 'image.png')

const payload = {
  outputs: [
    { id: 'gen-a', path: 'A:\\out\\txt2img\\images\\2026-09-02\\000001.png', kind: 'image' },
    { id: 'gen-b', path: 'A:\\out\\background_removal\\override\\cut.png', kind: 'image' },
  ],
  grid_paths: ['A:\\out\\txt2img\\grids\\2026-09-02\\grid.png'],
}

assert.equal(
  outputPathForCurrent(payload, 'gen-a'),
  'A:\\out\\txt2img\\images\\2026-09-02\\000001.png',
)
assert.equal(outputDirForCurrent(payload, 'gen-b'), 'A:\\out\\background_removal\\override')
assert.equal(outputDirForCurrent(payload, 'grid-0'), 'A:\\out\\txt2img\\grids\\2026-09-02')
assert.equal(outputPathForCurrent(payload, 'grid-1'), null)
assert.equal(outputDirForCurrent(payload, 'missing'), null)
assert.equal(outputDirForCurrent({ grid_path: 'C:\\grids\\one.png' }, 'grid-0'), 'C:\\grids')
assert.equal(outputDirForCurrent(null, 'gen-a'), null)

console.log('stageActions.check ok')
