import { freeComfy, getComfyStats, type ComfyStats } from '@/lib/api.ts'
import { toast } from '@/stores/toastStore.ts'
import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { useEffect, useState } from 'react'

function gb(bytes: number) {
  return bytes / (1024 * 1024 * 1024)
}

const HEAT = ['green', 'yellow', 'orange', 'red'] as const

function tempColor(c: number) {
  const t = Math.min(1, Math.max(0, (c - 50) / 45))
  const x = t * (HEAT.length - 1)
  const i = Math.min(HEAT.length - 2, Math.floor(x))
  const f = x - i
  const from = `var(--color-${HEAT[i]}-bright)`
  const to = `var(--color-${HEAT[i + 1]}-bright)`
  return `color-mix(in srgb, ${from} ${(1 - f) * 100}%, ${to})`
}

function sameStats(a: ComfyStats | null, b: ComfyStats) {
  return (
    a !== null &&
    a.reachable === b.reachable &&
    a.vram_used === b.vram_used &&
    a.vram_total === b.vram_total &&
    a.temp_c === b.temp_c
  )
}

export function GpuBar() {
  const [stats, setStats] = useState<ComfyStats | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let inflight = false
    let last: ComfyStats | null = null

    async function refresh() {
      if (inflight) {
        return
      }
      inflight = true
      try {
        const next = await getComfyStats()
        if (sameStats(last, next)) {
          return
        }
        last = next
        setStats(next)
      } catch {
        if (last !== null) {
          last = null
          setStats(null)
        }
      } finally {
        inflight = false
      }
    }

    void refresh()
    const timer = window.setInterval(() => void refresh(), 2000)
    return () => window.clearInterval(timer)
  }, [])

  async function run(unloadModels: boolean, freeMemory: boolean) {
    if (busy) {
      return
    }
    setBusy(true)
    try {
      await freeComfy(unloadModels, freeMemory)
      setStats(await getComfyStats())
      toast(unloadModels ? 'VRAM cleared' : 'Node cache cleared', 'info')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not free ComfyUI', 'error')
    } finally {
      setBusy(false)
    }
  }

  const total = stats?.vram_total || 0
  const used = stats?.vram_used || 0
  const usedPct = total > 0 ? Math.min(100, (used / total) * 100) : 0
  const label = total > 0 ? `${gb(used).toFixed(1)} / ${gb(total).toFixed(0)} GB` : '—'
  const live = stats?.reachable === true
  const temp = stats?.temp_c

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex h-8 overflow-hidden rounded border border-line" title={live ? `VRAM ${label}` : 'ComfyUI unreachable'}>
        <span className="flex items-center bg-line px-2 text-[10px] font-medium tracking-wide text-muted">VRAM</span>
        <div className="relative w-28 bg-field">
          <div
            className="absolute inset-0 origin-left bg-blue transition-transform duration-1000 ease-out"
            style={{ transform: `scaleX(${usedPct / 100})` }}
          />
          <span className="relative z-10 flex h-full items-center justify-center px-2 text-xs tabular-nums text-ink">
            {label}
          </span>
        </div>
      </div>
      {temp != null ? (
        <div className="flex h-8 overflow-hidden rounded border border-line" title="GPU temperature">
          <span className="flex items-center bg-line px-2 text-[10px] font-medium tracking-wide text-muted">TEMP</span>
          <span
            className="flex items-center bg-field px-2 text-xs tabular-nums transition-colors duration-700"
            style={{ color: tempColor(temp) }}
          >
            {temp}°
          </span>
        </div>
      ) : null}
      <button
        type="button"
        className="icon-btn text-ink"
        aria-label="Unload models"
        title="Unload models"
        disabled={busy}
        onClick={() => void run(true, false)}
      >
        <AppIcon id="download" />
      </button>
      <button
        type="button"
        className="icon-btn text-ink"
        aria-label="Free model and node cache"
        title="Free model and node cache"
        disabled={busy}
        onClick={() => void run(false, true)}
      >
        <AppIcon id="database" />
      </button>
    </div>
  )
}
