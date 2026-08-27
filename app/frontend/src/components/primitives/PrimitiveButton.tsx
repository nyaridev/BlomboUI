import { Slot } from '@radix-ui/react-slot'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function PrimitiveButton({
  asChild,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean; children?: ReactNode }) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp type={asChild ? undefined : 'button'} {...props}>
      {children}
    </Comp>
  )
}
