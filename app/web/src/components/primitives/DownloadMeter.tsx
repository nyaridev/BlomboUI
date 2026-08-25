type DownloadMeterProps = {
  pct: number
  label: string
}

export function DownloadMeter({ pct, label }: DownloadMeterProps) {
  const fill = Math.min(100, Math.max(0, pct))
  return (
    <div className="download-meter">
      <div className="download-meter-track">
        <div className="download-meter-fill" style={{ width: `${fill}%` }} />
      </div>
      <div className="flex items-baseline justify-between gap-2">
        {label ? <p className="min-w-0 truncate text-xs text-muted">{label}</p> : <span />}
        <span className="shrink-0 tabular-nums text-xs text-muted">{Math.round(fill)}%</span>
      </div>
    </div>
  )
}
