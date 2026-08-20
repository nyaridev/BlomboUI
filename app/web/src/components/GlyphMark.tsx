import { ICON_BY_ID } from '@/components/iconCatalog.ts'
import { CUSTOM_GLYPH, glyphColor, glyphColorMuted, type Glyph } from '@/components/glyph.ts'

type GlyphMarkProps = {
  value: Glyph
  size?: number
  className?: string
  muted?: boolean
}

export function GlyphMark({ value, size = 16, className = '', muted = false }: GlyphMarkProps) {
  if (value.kind === 'emoji') {
    return (
      <span
        className={['inline-flex shrink-0 items-center justify-center leading-none', muted ? 'opacity-70' : '', className]
          .filter(Boolean)
          .join(' ')}
        style={{ width: size, height: size, fontSize: size * 0.9 }}
        aria-hidden="true"
      >
        {value.id}
      </span>
    )
  }
  const Icon = ICON_BY_ID[value.id] ?? ICON_BY_ID[CUSTOM_GLYPH.id]
  if (!Icon) {
    return null
  }
  return (
    <Icon
      className={['shrink-0', className].filter(Boolean).join(' ')}
      size={size}
      color={muted ? glyphColorMuted(value.color) : glyphColor(value.color)}
      strokeWidth={2}
      aria-hidden="true"
    />
  )
}
