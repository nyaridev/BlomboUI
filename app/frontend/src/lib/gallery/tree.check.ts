import assert from 'node:assert/strict'
import { mergeGalleryTrees, type GalleryNode } from './tree.ts'

function dir(name: string, path: string, children: GalleryNode[] = []): GalleryNode {
  return { name, path, kind: 'dir', children }
}

function file(name: string, path: string): GalleryNode {
  return { name, path, kind: 'file', children: [] }
}

const emptyLocal = dir('Local', 'Local')
const emptyExtra = dir('Extra Set', 'Extra Set')

assert.deepEqual(mergeGalleryTrees([[emptyLocal, emptyExtra], [emptyLocal, emptyExtra]]), [
  dir('Local', 'Local'),
  dir('Extra Set', 'Extra Set'),
])

const left = dir('Local', 'Local', [dir('shared', 'Local/shared', [file('a.safetensors', 'Local/shared/a.safetensors')])])
const right = dir('Local', 'Local', [
  dir('shared', 'Local/shared', [file('b.safetensors', 'Local/shared/b.safetensors')]),
  dir('unet', 'Local/unet', [file('c.safetensors', 'Local/unet/c.safetensors')]),
])

assert.deepEqual(mergeGalleryTrees([[left], [right]]), [
  dir('Local', 'Local', [
    dir('shared', 'Local/shared', [
      file('a.safetensors', 'Local/shared/a.safetensors'),
      file('b.safetensors', 'Local/shared/b.safetensors'),
    ]),
    dir('unet', 'Local/unet', [file('c.safetensors', 'Local/unet/c.safetensors')]),
  ]),
])

const shared = dir('Local', 'Local')
const merged = mergeGalleryTrees([[shared], [dir('Local', 'Local', [file('x.ckpt', 'Local/x.ckpt')])]])
shared.children.push(file('mutated', 'Local/mutated'))
assert.deepEqual(merged, [dir('Local', 'Local', [file('x.ckpt', 'Local/x.ckpt')])])

console.log('tree.check ok')
