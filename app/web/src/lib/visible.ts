import { useCallback, useEffect, useState, type RefCallback } from 'react'

type Listener = (visible: boolean) => void

const listeners = new Map<Element, Listener>()
let observer: IntersectionObserver | null = null

function getObserver() {
  if (observer || typeof IntersectionObserver === 'undefined') {
    return observer
  }
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        listeners.get(entry.target)?.(entry.isIntersecting)
      }
    },
    { rootMargin: '400px' },
  )
  return observer
}

export function useVisible<T extends HTMLElement>(): [RefCallback<T>, boolean] {
  const [element, setElement] = useState<T | null>(null)
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined')
  const ref = useCallback<RefCallback<T>>((next) => setElement(next), [])

  useEffect(() => {
    if (!element) {
      return
    }
    const nextObserver = getObserver()
    if (!nextObserver) {
      setVisible(true)
      return
    }
    setVisible(false)
    listeners.set(element, setVisible)
    nextObserver.observe(element)
    return () => {
      listeners.delete(element)
      nextObserver.unobserve(element)
    }
  }, [element])

  return [ref, visible]
}
