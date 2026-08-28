import { CheckboxControl } from '@/components/controls/toggle/CheckboxControl.tsx'
import type { ReactNode } from 'react'

export function CheckRow({
  on,
  onChange,
  locked = false,
  children,
  className = '',
  align = 'center',
  tone = 'panel',
}: {
  on: boolean
  onChange: (on: boolean) => void
  locked?: boolean
  children: ReactNode
  className?: string
  align?: 'center' | 'start'
  tone?: 'panel' | 'field'
}) {
  return (
    <div
      className={[
        'flex gap-cluster rounded-md border border-line p-2.5',
        tone === 'field' ? 'bg-field' : 'bg-panel',
        align === 'start' ? 'items-start' : 'items-center',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className={['min-w-0 flex-1', on ? '' : 'opacity-50'].join(' ')}>{children}</div>
      <div className="flex shrink-0 items-center">
        <CheckboxControl checked={on} onChange={onChange} disabled={locked} />
      </div>
    </div>
  )
}
