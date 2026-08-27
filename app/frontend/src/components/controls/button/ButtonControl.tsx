import { PrimitiveButton } from '@/components/primitives/PrimitiveButton.tsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

const TONE = {
  generate: 'bg-generate',
  accent: 'bg-accent',
  muted: 'bg-muted',
  danger: 'bg-red',
  ghost: 'border border-line bg-transparent text-muted hover:bg-line hover:text-ink',
} as const

const SIZE = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3 py-2 text-sm',
  lg: 'px-3 py-2.5 text-sm',
  xl: 'px-6 text-xl',
} as const

export function ButtonControl({
  tone = 'accent',
  size = 'md',
  asChild,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: keyof typeof TONE
  size?: keyof typeof SIZE
  asChild?: boolean
  children?: ReactNode
}) {
  return (
    <PrimitiveButton
      asChild={asChild}
      className={[
        'rounded disabled:opacity-40',
        tone === 'ghost' ? '' : 'font-semibold text-ink',
        TONE[tone],
        SIZE[size],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </PrimitiveButton>
  )
}
