export function dirname(path: string): string {
  const text = path.trim()
  if (!text) {
    return ''
  }
  const i = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'))
  return i > 0 ? text.slice(0, i) : text
}

export function filenameFromPath(path: string | null | undefined): string {
  const text = String(path || '').trim()
  if (!text) {
    return 'image.png'
  }
  const i = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'))
  const name = (i >= 0 ? text.slice(i + 1) : text).trim()
  return name || 'image.png'
}

function gridPaths(payload: Record<string, unknown>): string[] {
  const grids = payload.grid_paths
  if (Array.isArray(grids)) {
    return grids.filter((item): item is string => typeof item === 'string' && Boolean(item))
  }
  const grid = payload.grid_path
  return typeof grid === 'string' && grid ? [grid] : []
}

export function outputPathForCurrent(
  payload: Record<string, unknown> | null | undefined,
  currentKey: string | null | undefined,
): string | null {
  if (!payload || !currentKey) {
    return null
  }
  const grid = /^grid-(\d+)$/.exec(currentKey)
  if (grid) {
    const path = gridPaths(payload)[Number(grid[1])]
    return path || null
  }
  const outputs = payload.outputs
  if (!Array.isArray(outputs)) {
    return null
  }
  for (const item of outputs) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const row = item as { id?: unknown; path?: unknown }
    if (row.id === currentKey && typeof row.path === 'string' && row.path) {
      return row.path
    }
  }
  return null
}

export function outputDirForCurrent(
  payload: Record<string, unknown> | null | undefined,
  currentKey: string | null | undefined,
): string | null {
  const path = outputPathForCurrent(payload, currentKey)
  const folder = path ? dirname(path) : ''
  return folder || null
}

export async function fileFromSrc(src: string, name: string): Promise<File> {
  const res = await fetch(src)
  if (!res.ok) {
    throw new Error('Could not load image')
  }
  const blob = await res.blob()
  const type = blob.type || 'image/png'
  return new File([blob], name, { type })
}
