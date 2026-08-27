type ProgressBarProps = {
  pct: number
  label: string
  segments?: string[]
}

export function ProgressBar({ pct, label, segments }: ProgressBarProps) {
  const fill = Math.min(100, Math.max(0, pct))
  return (
    <div className="relative h-7 overflow-hidden bg-field">
      <div
        className="flex h-full items-center justify-end bg-accent px-2.5"
        style={{ width: `${fill}%`, minWidth: 'fit-content' }}
      >
        <span className="whitespace-nowrap text-sm font-semibold text-ink">{label}</span>
      </div>
      {segments?.length ? (
        <div className="pointer-events-none absolute inset-0 flex">
          {segments.map((name) => (
            <div key={name} className="min-w-0 flex-1 border-r border-bg/50 last:border-0" title={name} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
