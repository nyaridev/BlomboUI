export type TimeDisplay = 'full' | 'ampm'

export function formatUnix(unix: number, display: TimeDisplay) {
  if (!unix) {
    return ''
  }
  const ampm = display === 'ampm'
  return new Date(unix * 1000).toLocaleString(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: ampm ? 'numeric' : '2-digit',
    minute: '2-digit',
    hour12: ampm,
  })
}
