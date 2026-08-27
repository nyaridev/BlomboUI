import { ButtonControl } from '@/components/controls/button/ButtonControl.tsx'

export function GenerateActions({
  busy,
  canGenerate,
  onGenerate,
  onInterrupt,
}: {
  busy: boolean
  canGenerate: boolean
  onGenerate: () => void
  onInterrupt: (mode: 'skip' | 'cancel') => void
}) {
  return (
    <div className="flex w-80 shrink-0 flex-col gap-stack self-stretch">
      <ButtonControl
        tone="generate"
        size="xl"
        className="flex-1"
        disabled={busy || !canGenerate}
        onClick={onGenerate}
      >
        Generate
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
