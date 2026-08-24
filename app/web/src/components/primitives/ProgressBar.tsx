type ProgressBarProps = {
  pct: number
  label: string
}

export function ProgressBar({ pct, label }: ProgressBarProps) {
  const fill = Math.min(100, Math.max(0, pct))
  return (
    <div className="h-7 overflow-hidden bg-field">
      <div
        className="flex h-full items-center justify-end bg-accent px-2.5"
        style={{ width: `${fill}%`, minWidth: 'fit-content' }}
      >
        <span className="whitespace-nowrap text-sm font-semibold text-ink">{label}</span>
      </div>
    </div>
  )
}
