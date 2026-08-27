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

export const LOCAL_DIR = 'Local'

export function treeDisplayPath(
  item: { tag?: string; path: string; source?: string },
  extraNames: string[],
): string {
  const file = (item.source || item.path.split('#')[0] || item.path).replace(/\\/g, '/')
  const display = (item.tag || item.path).replace(/\\/g, '/')
  const first = file.split('/')[0]
  if (extraNames.includes(first)) {
    if (display === first || display.startsWith(`${first}/`)) {
      return display
    }
    return `${first}/${display}`
  }
  if (display === LOCAL_DIR || display.startsWith(`${LOCAL_DIR}/`)) {
    return display
  }
  return `${LOCAL_DIR}/${display}`
}

export function identToDisplay(ident: string, extraNames: string[]): string {
  const name = ident.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  if (!name) {
    return LOCAL_DIR
  }
  const first = name.split('/')[0]
  if (extraNames.includes(first) || name === LOCAL_DIR || name.startsWith(`${LOCAL_DIR}/`)) {
    return name
  }
  return `${LOCAL_DIR}/${name}`
}

export function displayToIdent(display: string): string {
  const name = display.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  if (!name || name === LOCAL_DIR) {
    return ''
  }
  if (name.startsWith(`${LOCAL_DIR}/`)) {
    return name.slice(LOCAL_DIR.length + 1)
  }
  return name
}

export function scopeRoot(path: string, extraNames: string[]): string {
  const ident = displayToIdent(path)
  if (!ident) {
    return LOCAL_DIR
  }
  const first = ident.split('/')[0]
  return extraNames.includes(first) ? first : LOCAL_DIR
}

export function parentIdent(ident: string): string {
  const name = ident.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  const cut = name.lastIndexOf('/')
  return cut > 0 ? name.slice(0, cut) : ''
}

export function collectDirPaths(nodes: GalleryNode[]): Set<string> {
  const out = new Set<string>()
  function walk(list: GalleryNode[]) {
    for (const node of list) {
      if (node.kind !== 'dir') {
        continue
      }
      out.add(node.path)
      walk(node.children)
    }
  }
  walk(nodes)
  return out
}

export function siblingNames(nodes: GalleryNode[], folder: string): string[] | null {
  for (const node of nodes) {
    if (node.kind !== 'dir') {
      continue
    }
    if (node.path === folder) {
      return node.children.map((child) => child.name)
    }
    const inner = siblingNames(node.children, folder)
    if (inner) {
      return inner
    }
  }
  return null
}

export function toDisplayRoots(
  roots: { name: string; path: string; kind: 'dir' | 'file'; children?: unknown[] }[],
  extraNames: string[],
): GalleryNode[] {
  function mapNode(node: { name: string; path: string; kind: 'dir' | 'file'; children?: unknown[] }): GalleryNode {
    const children = Array.isArray(node.children)
      ? node.children.map((child) => mapNode(child as { name: string; path: string; kind: 'dir' | 'file'; children?: unknown[] }))
      : []
    return {
      name: node.name,
      path: identToDisplay(node.path, extraNames),
      kind: node.kind,
      children,
    }
  }
  return roots.map(mapNode)
}

