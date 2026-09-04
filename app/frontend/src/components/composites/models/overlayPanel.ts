import type { CSSProperties } from 'react'

export function placePanel(anchor: DOMRect): CSSProperties {
  const width = Math.min(window.innerWidth - 16, 56 * 16)
  const height = Math.min(window.innerHeight - 24, 36 * 16)
  const gap = 4
  let top = anchor.bottom + gap
  let left = anchor.left
  if (top + height > window.innerHeight - 8) {
    top = Math.max(8, anchor.top - gap - height)
  }
  if (left + width > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - 8 - width)
  }
  return { top, left, width, height }
}

export function isTopOverlay(panel: HTMLElement | null) {
  if (!panel) {
    return false
  }
  const overlays = document.querySelectorAll('[data-overlay]')
  return overlays[overlays.length - 1] === panel
}

export function isForeignOverlay(panel: HTMLElement | null, node: EventTarget | null) {
  if (!(node instanceof Element) || !panel) {
    return false
  }
  const overlay = node.closest('[data-overlay], [data-models-picker]')
  return Boolean(overlay && overlay !== panel)
}
