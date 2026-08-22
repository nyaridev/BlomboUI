import { AppIcon } from '@/components/AppIcon.tsx'

export function DownloadedBadge() {
  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-green/70 bg-green/25 text-green-bright"
      title="Already downloaded"
    >
      <AppIcon id="check" size={12} />
    </span>
  )
}

export function DownloadingBadge() {
  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-accent/70 bg-accent/25 text-accent"
      title="Downloading"
    >
      <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-accent/40 border-t-accent" />
    </span>
  )
}
