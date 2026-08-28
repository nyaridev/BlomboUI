import { ButtonControl } from '@/components/controls/button/ButtonControl.tsx'

export function GenerateActions({
  busy,
  canGenerate,
  onGenerate,
  onInterrupt,
  label = 'Generate',
  layout = 'chrome',
}: {
  busy: boolean
  canGenerate: boolean
  onGenerate: () => void
  onInterrupt: (mode: 'skip' | 'cancel') => void
  label?: string
  layout?: 'chrome' | 'bar'
}) {
  const bar = layout === 'bar'
  return (
    <div className={bar ? 'flex w-full shrink-0 flex-col gap-stack' : 'flex w-80 shrink-0 flex-col gap-stack self-stretch'}>
      <ButtonControl
        tone="generate"
        size={bar ? 'lg' : 'xl'}
        className={bar ? '' : 'flex-1'}
        disabled={busy || !canGenerate}
        onClick={onGenerate}
      >
        {label}
      </ButtonControl>
      <div className="flex gap-stack">
        <ButtonControl tone="muted" size="lg" className="flex-1" disabled={!busy} title="Skip current image" onClick={() => onInterrupt('skip')}>
          Interrupt
        </ButtonControl>
        <ButtonControl
          tone="danger"
          size="lg"
          className="flex-1 hover:brightness-110 disabled:hover:brightness-100"
          disabled={!busy}
          title="Cancel remaining jobs"
          onClick={() => onInterrupt('cancel')}
        >
          Cancel
        </ButtonControl>
      </div>
    </div>
  )
}
