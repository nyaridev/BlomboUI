import { PrimitiveInput } from '@/components/primitives/PrimitiveInput.tsx'
import type { InputHTMLAttributes } from 'react'

const FIELD =
  'w-full rounded border border-line bg-field px-2 py-1.5 text-sm text-ink outline-none placeholder:text-muted focus:border-accent'

export function TextField({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <PrimitiveInput className={[FIELD, className].filter(Boolean).join(' ')} {...props} />
}

export function fieldClass() {
  return FIELD
}
