export function middleOpen(event: { button: number; preventDefault: () => void }, src: string) {
  if (event.button !== 1 || !src) {
    return false
  }
  event.preventDefault()
  window.open(src, '_blank', 'noopener,noreferrer')
  return true
}
