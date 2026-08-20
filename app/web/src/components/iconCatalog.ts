import { icons, type LucideIcon } from 'lucide-react'

function toKebab(name: string) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d)/g, '$1-$2')
    .toLowerCase()
}

export const ICON_BY_ID = Object.fromEntries(
  Object.entries(icons).map(([name, Icon]) => [toKebab(name), Icon]),
) as Record<string, LucideIcon>

export const ICON_IDS = Object.keys(ICON_BY_ID)
