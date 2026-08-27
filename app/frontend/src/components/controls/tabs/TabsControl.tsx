import { PrimitiveTabStrip, PrimitiveTabsTrigger } from '@/components/primitives/PrimitiveTabs.tsx'
import { PrimitiveButton } from '@/components/primitives/PrimitiveButton.tsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function tabTriggerClass(active: boolean, extra = '', flush: 'panel' | 'page' = 'panel') {
  const on =
    flush === 'page'
      ? 'border-line border-b-bg bg-bg text-ink'
      : 'border-line border-b-panel bg-panel text-ink'
  return [extra, '-mb-px rounded-t-md border px-3 py-1.5 text-sm', active ? on : 'border-transparent text-muted hover:text-ink'].join(' ')
}

export function TabsList({
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
    <PrimitiveTabStrip value={value} onValueChange={onValueChange} className={className}>
      {children}
    </PrimitiveTabStrip>
  )
}

export function TabsTrigger({
  value,
  active,
  extra,
  children,
}: {
  value: string
  active: boolean
  extra?: string
  children: ReactNode
}) {
  return (
    <PrimitiveTabsTrigger value={value} className={tabTriggerClass(active, extra)}>
      {children}
    </PrimitiveTabsTrigger>
  )
}

export function TabButton({
  active,
  extra,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active: boolean
  extra?: string
  children?: ReactNode
}) {
  return (
    <PrimitiveButton className={[tabTriggerClass(active, extra), className].filter(Boolean).join(' ')} {...props}>
      {children}
    </PrimitiveButton>
  )
}
