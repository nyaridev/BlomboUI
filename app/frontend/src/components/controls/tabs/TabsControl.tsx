import { PrimitiveTabStrip, PrimitiveTabsTrigger } from '@/components/primitives/PrimitiveTabs.tsx'
import { PrimitiveButton } from '@/components/primitives/PrimitiveButton.tsx'
import { CheckboxControl } from '@/components/controls/toggle/CheckboxControl.tsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function tabTriggerClass(active: boolean, extra = '', flush: 'panel' | 'page' = 'panel', pad = 'px-3') {
  const on =
    flush === 'page'
      ? 'border-line border-b-bg bg-bg text-ink'
      : 'border-line border-b-panel bg-panel text-ink'
  return [
    '-mb-px inline-flex items-center rounded-t-md border py-1.5 text-sm leading-none',
    pad,
    active ? on : 'border-transparent text-muted hover:text-ink',
    extra,
  ]
    .filter(Boolean)
    .join(' ')
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
  checked,
  onCheckedChange,
  disabled,
}: {
  value: string
  active: boolean
  extra?: string
  children: ReactNode
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <PrimitiveTabsTrigger value={value} className={tabTriggerClass(active, extra)}>
      {onCheckedChange ? (
        <span className="inline-flex items-center gap-stack">
          <span
            className="inline-flex"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <CheckboxControl checked={Boolean(checked)} onChange={onCheckedChange} disabled={disabled} />
          </span>
          {children}
        </span>
      ) : (
        children
      )}
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
