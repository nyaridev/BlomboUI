export type Glyph =
  | { kind: 'icon'; id: string; color: string }
  | { kind: 'emoji'; id: string }

export const GLYPH_COLORS = [
  { id: 'ink', css: 'var(--color-ink)' },
  { id: 'muted', css: 'var(--color-muted)' },
  { id: 'accent', css: 'var(--color-accent)' },
  { id: 'red', css: 'var(--color-red-bright)' },
  { id: 'orange', css: 'var(--color-orange-bright)' },
  { id: 'yellow', css: 'var(--color-yellow-bright)' },
  { id: 'green', css: 'var(--color-green-bright)' },
  { id: 'cyan', css: 'var(--color-cyan-bright)' },
  { id: 'blue', css: 'var(--color-blue-bright)' },
  { id: 'purple', css: 'var(--color-purple-bright)' },
  { id: 'pink', css: 'var(--color-pink-bright)' },
] as const

export type GlyphColorId = (typeof GLYPH_COLORS)[number]['id']

export const BUILTIN_GLYPH: Glyph = { kind: 'icon', id: 'layout-template', color: 'muted' }
export const CUSTOM_GLYPH: Glyph = { kind: 'icon', id: 'bookmark', color: 'ink' }

const ICON_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const COLOR_IDS = new Set<string>(GLYPH_COLORS.map((item) => item.id))

export function glyphColor(id: string) {
  return GLYPH_COLORS.find((item) => item.id === id)?.css ?? GLYPH_COLORS[0].css
}

export function glyphColorMuted(id: string) {
  return `color-mix(in srgb, ${glyphColor(id)} 60%, var(--color-muted))`
}

export function parseGlyph(raw: unknown): Glyph {
  if (!raw || typeof raw !== 'object') {
    return { ...CUSTOM_GLYPH }
  }
  const item = raw as Record<string, unknown>
  const id = typeof item.id === 'string' ? item.id.trim() : ''
  if (item.kind === 'emoji' && id && id.length <= 32) {
    return { kind: 'emoji', id }
  }
  if (item.kind === 'icon' && ICON_ID.test(id)) {
    const color = typeof item.color === 'string' && COLOR_IDS.has(item.color) ? item.color : 'ink'
    return { kind: 'icon', id, color }
  }
  return { ...CUSTOM_GLYPH }
}

export function glyphOf(item: { builtin?: boolean; icon?: unknown }): Glyph {
  return item.builtin ? BUILTIN_GLYPH : parseGlyph(item.icon)
}
