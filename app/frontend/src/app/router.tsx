export const FILL_PATHS = new Set([
  '/file-info',
  '/gallery',
  '/models',
  '/wildcards',
  '/scopes',
  '/settings',
  '/history',
  '/errors',
])

export const REDIRECTS = [
  ['/png-info', '/file-info'],
  ['/downloads', '/history'],
] as const

export function paneClass(on: boolean, fill = false) {
  if (!on) {
    return 'hidden'
  }
  return fill ? 'flex h-full min-h-0 min-w-0 flex-col' : 'flex min-h-full flex-col'
}
