import type { ReactNode } from 'react'
import { PrimitiveButton } from '@/components/primitives/PrimitiveButton.tsx'

const TONE = {
  blue: 'bg-blue text-ink',
  purple: 'bg-purple text-ink',
  line: 'bg-line text-ink',
} as const

export function SegmentSwitch<T extends string>({
  value,
  options,
  tone = 'line',
  fill = false,
  disabled = false,
  onChange,
}: {
  value: T
  options: { id: T; label: ReactNode }[]
  tone?: keyof typeof TONE
  fill?: boolean
  disabled?: boolean
  onChange: (id: T) => void
}) {
  const last = options.length - 1
  return (
    <div
      className={[
        fill ? 'flex w-full' : 'inline-flex shrink-0',
        'h-toolbar overflow-hidden rounded border border-line text-xs',
        disabled ? 'pointer-events-none opacity-40' : '',
      ].join(' ')}
    >
      {options.map((item, index) => (
        <PrimitiveButton
          key={item.id}
          disabled={disabled}
          className={[
            'inline-flex h-full items-center justify-center gap-1.5 px-2.5',
            fill ? 'min-w-0 flex-1' : '',
            index === 0 ? 'rounded-l' : '',
            index === last ? 'rounded-r' : '',
            value === item.id ? TONE[tone] : 'text-muted hover:text-ink',
          ].join(' ')}
          aria-pressed={value === item.id}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </PrimitiveButton>
      ))}
    </div>
  )
}
