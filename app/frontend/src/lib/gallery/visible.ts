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

function isShown(element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    return false
  }
  let node: HTMLElement | null = element
  while (node) {
    const style = window.getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false
    }
    node = node.parentElement
  }
  return true
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
    const sync = () => {
      if (!isShown(element)) {
        setVisible(false)
        return
      }
      nextObserver.unobserve(element)
      nextObserver.observe(element)
    }
    setVisible(false)
    listeners.set(element, setVisible)
    nextObserver.observe(element)
    const resize = new ResizeObserver(sync)
    resize.observe(element)
    return () => {
      listeners.delete(element)
      nextObserver.unobserve(element)
      resize.disconnect()
    }
  }, [element])

  return [ref, visible]
}
