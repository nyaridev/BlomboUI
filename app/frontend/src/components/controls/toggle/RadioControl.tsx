import { PrimitiveRadioGroup, PrimitiveRadioItem } from '@/components/primitives/PrimitiveToggle.tsx'
import type { ReactNode } from 'react'

export function RadioGroupControl({
  value,
  onChange,
  children,
  className = '',
  name,
}: {
  value?: string
  onChange?: (value: string) => void
  children: ReactNode
  className?: string
  name?: string
}) {
  return (
    <PrimitiveRadioGroup className={className} value={value} name={name} onValueChange={onChange}>
      {children}
    </PrimitiveRadioGroup>
  )
}

export function RadioControl({ value, className = '', disabled }: { value: string; className?: string; disabled?: boolean }) {
  return <PrimitiveRadioItem value={value} disabled={disabled} className={['radio', className].filter(Boolean).join(' ')} />
}

export function RadioCard({ value, children }: { value: string; children: ReactNode }) {
  return (
    <label className="radio-card text-sm text-ink">
      <RadioControl value={value} />
      {children}
    </label>
  )
}
