import { getLatestGalleryItem, listGallerySince, syncGallery } from '@/lib/api/gallery.ts'
import { useCallback, useEffect, useRef } from 'react'

const SYNC_GAP_MS = 30_000

export function useGalleryLive(visible: boolean, onLive: () => void) {
  const newest = useRef('')
  const lastSync = useRef(0)
  const onLiveRef = useRef(onLive)
  onLiveRef.current = onLive

  const setNewest = useCallback((stamp: string) => {
    if (stamp && stamp > newest.current) {
      newest.current = stamp
    }
  }, [])

  useEffect(() => {
    if (!visible) {
      return
    }
    let stop = false
    const now = Date.now()
    if (now - lastSync.current >= SYNC_GAP_MS) {
      lastSync.current = now
      void syncGallery().catch(() => undefined)
    }
    const timer = window.setInterval(() => {
      const stamp = newest.current
      if (!stamp) {
        void getLatestGalleryItem()
          .then((item) => {
            if (stop || !item) {
              return
            }
            setNewest(item.created_at)
            onLiveRef.current()
          })
          .catch(() => undefined)
        return
      }
      void listGallerySince(stamp)
        .then((items) => {
          if (stop || !items.length) {
            return
          }
          for (const item of items) {
            setNewest(item.created_at)
          }
          onLiveRef.current()
        })
        .catch(() => undefined)
    }, 6000)
    return () => {
      stop = true
      window.clearInterval(timer)
    }
  }, [visible, setNewest])

  return setNewest
}
