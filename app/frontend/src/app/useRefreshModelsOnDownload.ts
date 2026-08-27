import { useEffect, useRef } from 'react'
import { useDownloadsStore } from '@/stores/downloadsStore.ts'
import { useModelsStore } from '@/stores/modelsStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'

function doneIds(items: { id: number; status: string }[]) {
  return items.filter((item) => item.status === 'done').map((item) => item.id)
}

export function useRefreshModelsOnDownload() {
  const enabled = useSettingsStore((s) => s.civitaiDownload.refreshModelsAfterDownload)
  const inFlight = useDownloadsStore((s) => s.active.length + s.queued.length)
  const seen = useRef(new Set<number>())
  const primed = useRef(false)
  const wasEnabled = useRef(enabled)
  const retry = useRef(0)

  useEffect(() => {
    void useDownloadsStore.getState().load({ silent: true })
  }, [])

  useEffect(() => {
    if (enabled && !wasEnabled.current) {
      seen.current = new Set(doneIds(useDownloadsStore.getState().items))
      primed.current = true
    }
    wasEnabled.current = enabled
  }, [enabled])

  useEffect(() => {
    if (!enabled || inFlight === 0) {
      return
    }
    const load = useDownloadsStore.getState().load
    const id = window.setInterval(() => {
      void load({ silent: true })
    }, 500)
    return () => window.clearInterval(id)
  }, [enabled, inFlight])

  useEffect(() => {
    function consume() {
      const ids = doneIds(useDownloadsStore.getState().items)
      if (!useSettingsStore.getState().civitaiDownload.refreshModelsAfterDownload) {
        seen.current = new Set(ids)
        primed.current = true
        return
      }
      if (!primed.current) {
        seen.current = new Set(ids)
        primed.current = true
        return
      }
      const fresh = ids.filter((id) => !seen.current.has(id))
      if (!fresh.length) {
        seen.current = new Set(ids)
        return
      }
      if (useModelsStore.getState().busy) {
        window.clearTimeout(retry.current)
        retry.current = window.setTimeout(consume, 400)
        return
      }
      seen.current = new Set(ids)
      void useModelsStore.getState().refresh({ silent: true })
    }

    return useDownloadsStore.subscribe(consume)
  }, [])

  useEffect(() => {
    return () => window.clearTimeout(retry.current)
  }, [])
}
