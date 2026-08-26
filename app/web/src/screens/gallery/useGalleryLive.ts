import { getLatestGalleryItem, listGallerySince, syncGallery } from '@/lib/api/gallery.ts'
import { useCallback, useEffect, useRef } from 'react'

export function useGalleryLive(visible: boolean, onReload: () => void) {
  const newest = useRef('')
  const onReloadRef = useRef(onReload)
  onReloadRef.current = onReload

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
    void syncGallery().catch(() => undefined)
    onReloadRef.current()
    const timer = window.setInterval(() => {
      const stamp = newest.current
      if (!stamp) {
        void getLatestGalleryItem()
          .then((item) => {
            if (!stop && item) {
              onReloadRef.current()
            }
          })
          .catch(() => undefined)
        return
      }
      void listGallerySince(stamp)
        .then((items) => {
          if (!stop && items.length) {
            onReloadRef.current()
          }
        })
        .catch(() => undefined)
    }, 2000)
    return () => {
      stop = true
      window.clearInterval(timer)
    }
  }, [visible])

  return setNewest
}
