import { useHealthStore } from '@/stores/healthStore.ts'

export function ComfyStatus() {
  const health = useHealthStore((s) => s.health)
  const status = useHealthStore((s) => s.status)
  const reachable = health?.comfy.reachable === true
  const restarting = health?.comfy.restarting === true
  const missing = health?.comfy.mode === 'missing'
  const tone = restarting ? 'orange' : reachable ? 'green' : 'red'
  const label = restarting
    ? 'ComfyUI is restarting'
    : reachable
      ? 'ComfyUI is running'
      : missing
        ? 'ComfyUI is not installed'
        : status === 'error'
          ? 'ComfyUI is unreachable'
          : 'ComfyUI is not running'
  const url = health?.comfy.url || 'http://127.0.0.1:8188'

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-field"
      aria-label={label}
      title={label}
    >
      <span
        className={[
          'h-2.5 w-2.5 rounded-full',
          tone === 'green' ? 'bg-green-bright' : tone === 'orange' ? 'bg-orange-bright' : 'bg-red-bright',
          restarting ? 'animate-pulse' : '',
        ].join(' ')}
      />
    </a>
  )
}
