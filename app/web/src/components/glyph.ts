export type Glyph =
  | { kind: 'icon'; id: string; color: string }
  | { kind: 'emoji'; id: string }

export const GLYPH_COLORS = [
  { id: 'ink', css: 'var(--color-ink)' },
  { id: 'muted', css: 'var(--color-muted)' },
  { id: 'accent', css: 'var(--color-accent)' },
  { id: 'red', css: '#e5484d' },
  { id: 'orange', css: '#f76b15' },
  { id: 'yellow', css: '#f5d90a' },
  { id: 'green', css: '#46a758' },
  { id: 'cyan', css: '#12a594' },
  { id: 'blue', css: '#3b82f6' },
  { id: 'purple', css: '#8b5cf6' },
  { id: 'pink', css: '#e54666' },
] as const

export type GlyphColorId = (typeof GLYPH_COLORS)[number]['id']

export const BUILTIN_GLYPH: Glyph = { kind: 'icon', id: 'layout-template', color: 'accent' }
export const CUSTOM_GLYPH: Glyph = { kind: 'icon', id: 'bookmark', color: 'ink' }

const ICON_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const COLOR_IDS = new Set<string>(GLYPH_COLORS.map((item) => item.id))

export function glyphColor(id: string) {
  return GLYPH_COLORS.find((item) => item.id === id)?.css ?? GLYPH_COLORS[0].css
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
