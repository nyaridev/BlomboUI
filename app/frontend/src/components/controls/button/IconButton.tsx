import { PrimitiveButton } from '@/components/primitives/PrimitiveButton.tsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function IconButton({
  on,
  tone,
  label,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean; tone?: 'ghost'; label?: boolean; children?: ReactNode }) {
  return (
    <PrimitiveButton
      className={['icon-btn', tone === 'ghost' ? 'ghost' : '', on ? 'on' : '', label ? 'label' : '', className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </PrimitiveButton>
  )
}
