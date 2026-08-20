import { ICON_BY_ID } from '@/components/iconCatalog.ts'

export function AppIcon({
  id,
  size = 16,
  strokeWidth = 2,
  className = '',
}: {
  id: string
  size?: number
  strokeWidth?: number
  className?: string
}) {
  const Icon = ICON_BY_ID[id]
  if (!Icon) {
    return null
  }
  return <Icon size={size} strokeWidth={strokeWidth} className={['shrink-0', className].filter(Boolean).join(' ')} aria-hidden="true" />
}
