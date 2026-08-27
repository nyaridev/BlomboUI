export function isTyping(event: KeyboardEvent) {
  const el = event.target
  if (!(el instanceof HTMLElement)) {
    return false
  }
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export function overlayOpen() {
  return Boolean(document.querySelector('[data-overlay]'))
}

export function digitKey(event: KeyboardEvent) {
  if (event.key >= '1' && event.key <= '9') {
    return Number(event.key)
  }
  return null
}
