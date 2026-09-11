export function fittedHeight(defaultHeight: number, content: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.max(defaultHeight, content)))
}

export function contentHeight(el: HTMLElement): number {
  const prev = el.style.height
  el.style.height = '0px'
  const next = el.scrollHeight + (el.offsetHeight - el.clientHeight)
  el.style.height = prev
  return next
}

export function fitContentHeight(el: HTMLElement, defaultHeight: number, min: number, max: number): number {
  return fittedHeight(defaultHeight, contentHeight(el), min, max)
}
