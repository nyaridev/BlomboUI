import { freeComfy, getComfyStats, type ComfyStats } from '@/lib/api.ts'
import { toast } from '@/stores/toastStore.ts'
import { useEffect, useState } from 'react'

function gb(bytes: number) {
  return bytes / (1024 * 1024 * 1024)
}

function tempColor(c: number) {
  const t = Math.min(1, Math.max(0, (c - 40) / 45))
  return `hsl(${130 - t * 130} 72% 58%)`
}

function UnloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="2" y="8.5" width="10" height="3.5" rx="0.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M7 2.2v5.2M4.6 5.2 7 7.6 9.4 5.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CacheIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M3.2 11.2c1.6-1.2 2.2-3.2 2.2-5.2V3.2h3.2V6c0 2 0.6 4 2.2 5.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path d="M4.4 11.2h5.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
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
    } catch {
      /* keep last stats */
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
            className="absolute inset-0 origin-left bg-accent/70 transition-transform duration-1000 ease-out"
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
        className="icon-btn"
        aria-label="Unload models"
        title="Unload models"
        disabled={!live || busy}
        onClick={() => void run(true, false)}
      >
        <UnloadIcon />
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label="Free model and node cache"
        title="Free model and node cache"
        disabled={!live || busy}
        onClick={() => void run(false, true)}
      >
        <CacheIcon />
      </button>
    </div>
  )
}
