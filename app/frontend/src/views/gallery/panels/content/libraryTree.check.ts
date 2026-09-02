import assert from 'node:assert/strict'
import type { GalleryLibrary } from '../../../../lib/api/gallery.ts'
import { dropOnItem, orderChanged, placeIds } from './libraryTree.ts'

function lib(
  id: string,
  parent: string | null,
  position: number,
  kind: GalleryLibrary['kind'] = 'library',
): GalleryLibrary {
  return {
    id,
    name: id,
    query: '',
    scopes: [],
    models: [],
    loras: [],
    wildcards: [],
    created_at: '',
    kind,
    parent_id: parent,
    position,
    previews: [],
  }
}

const a = lib('a', null, 0)
const b = lib('b', null, 1)
const c = lib('c', null, 2)
const folder = lib('f', null, 3, 'folder')
const items = [a, b, c, folder]

assert.deepEqual(placeIds(items, null, 'b', 'a'), ['b', 'a', 'c', 'f'])
assert.deepEqual(placeIds(items, null, 'b', 'b'), ['a', 'b', 'c', 'f'])
assert.deepEqual(placeIds(items, null, 'a', 'c'), ['b', 'a', 'c', 'f'])
assert.deepEqual(placeIds(items, null, 'a', null), ['b', 'c', 'f', 'a'])
assert.deepEqual(placeIds(items, 'f', 'a', null), ['a'])
assert.equal(orderChanged(items, null, 'b', ['a', 'b', 'c', 'f']), false)
assert.equal(orderChanged(items, null, 'b', ['b', 'a', 'c', 'f']), true)
assert.equal(orderChanged(items, 'f', 'a', ['a']), true)

const before = dropOnItem(b, 10, 0, 100, 'c', 'x')
assert.deepEqual(before, { parentId: null, beforeId: 'b' })
const after = dropOnItem(b, 80, 0, 100, 'c', 'x')
assert.deepEqual(after, { parentId: null, beforeId: 'c' })
const nest = dropOnItem(folder, 50, 0, 100, null, 'x')
assert.deepEqual(nest, { parentId: 'f', beforeId: null })
const rowAfter = dropOnItem(folder, 90, 0, 100, 'c', 'y')
assert.deepEqual(rowAfter, { parentId: null, beforeId: 'c' })

console.log('libraryTree.check ok')
