import { PrimitiveButton } from '@/components/primitives/PrimitiveButton.tsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function ChoiceChip({
  active,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; children?: ReactNode }) {
  return (
    <PrimitiveButton
      className={[
        'rounded border px-2 text-sm',
        active ? 'border-accent bg-accent text-ink' : 'border-line bg-field text-muted hover:text-ink',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </PrimitiveButton>
  )
}
