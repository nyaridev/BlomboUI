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
  onChange,
}: {
  value: T
  options: { id: T; label: string }[]
  tone?: keyof typeof TONE
  onChange: (id: T) => void
}) {
  const last = options.length - 1
  return (
    <div className="inline-flex h-toolbar shrink-0 overflow-hidden rounded border border-line text-xs">
      {options.map((item, index) => (
        <PrimitiveButton
          key={item.id}
          className={[
            'h-full px-2.5',
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
