export type GalleryNode = {
  name: string
  path: string
  kind: 'dir' | 'file'
  children: GalleryNode[]
}

function cmpName(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: 'base' })
}

function sortNodes(nodes: GalleryNode[]) {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === 'dir' ? -1 : 1
    }
    return cmpName(a.name, b.name)
  })
  for (const node of nodes) {
    if (node.children.length) {
      sortNodes(node.children)
    }
  }
}

export function buildGalleryTree(items: string[]): GalleryNode[] {
  const root: GalleryNode[] = []
  const dirs = new Map<string, GalleryNode>()
  const prefixes = new Set<string>()
  for (const item of items) {
    if (!item) {
      continue
    }
    let cut = item.lastIndexOf('/')
    while (cut > 0) {
      prefixes.add(item.slice(0, cut))
      cut = item.slice(0, cut).lastIndexOf('/')
    }
  }

  function ensureDir(path: string): GalleryNode {
    const existing = dirs.get(path)
    if (existing) {
      return existing
    }
    const name = path.split('/').pop() || path
    const node: GalleryNode = { name, path, kind: 'dir', children: [] }
    dirs.set(path, node)
    const cut = path.lastIndexOf('/')
    if (cut > 0) {
      ensureDir(path.slice(0, cut)).children.push(node)
    } else {
      root.push(node)
    }
    return node
  }

  for (const item of items) {
    if (!item) {
      continue
    }
    if (prefixes.has(item)) {
      continue
    }
    const cut = item.lastIndexOf('/')
    const file: GalleryNode = {
      name: cut >= 0 ? item.slice(cut + 1) : item,
      path: item,
      kind: 'file',
      children: [],
    }
    if (cut > 0) {
      ensureDir(item.slice(0, cut)).children.push(file)
    } else {
      root.push(file)
    }
  }

  sortNodes(root)
  return root
}

export function dirExists(items: string[], dirPath: string): boolean {
  if (!dirPath) {
    return true
  }
  const prefix = dirPath.endsWith('/') ? dirPath : `${dirPath}/`
  return items.some((item) => item.startsWith(prefix))
}
