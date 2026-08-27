export const MODEL_TILE_STYLES = [
  { id: 'tall', label: 'Tall', width: 'w-28', overlay: true, gap: 'gap-2', text: false },
  { id: 'compact', label: 'Min', width: 'w-20', overlay: false, gap: 'gap-1', text: false },
  { id: 'text', label: 'Text', width: 'w-40', overlay: false, gap: 'gap-1.5', text: true },
] as const

export type ModelTileStyle = (typeof MODEL_TILE_STYLES)[number]['id']

export function parseModelTileStyle(value: unknown): ModelTileStyle {
  return MODEL_TILE_STYLES.some((item) => item.id === value) ? (value as ModelTileStyle) : 'tall'
}

export function modelTileSpec(style: ModelTileStyle) {
  return MODEL_TILE_STYLES.find((item) => item.id === style) ?? MODEL_TILE_STYLES[0]
}
