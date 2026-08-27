import * as Tabs from '@radix-ui/react-tabs'
import type { ReactNode } from 'react'

export const PrimitiveTabs = Tabs.Root
export const PrimitiveTabsList = Tabs.List
export const PrimitiveTabsTrigger = Tabs.Trigger
export const PrimitiveTabsContent = Tabs.Content

export function PrimitiveTabStrip({
  value,
  onValueChange,
  children,
  className,
}: {
  value: string
  onValueChange: (value: string) => void
  children: ReactNode
  className?: string
}) {
  return (
    <Tabs.Root value={value} onValueChange={onValueChange}>
      <Tabs.List className={className}>{children}</Tabs.List>
    </Tabs.Root>
  )
}
