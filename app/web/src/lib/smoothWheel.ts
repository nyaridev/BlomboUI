const DURATION = 250
const SPEED = 0.9
const LINE = 16

type Anim = {
  fromX: number
  fromY: number
  toX: number
  toY: number
  startedAt: number
  raf: number
}

function canScroll(el: HTMLElement, axis: 'x' | 'y') {
  const style = getComputedStyle(el)
  const overflow = axis === 'x' ? style.overflowX : style.overflowY
  if (overflow !== 'auto' && overflow !== 'scroll' && overflow !== 'overlay') {
    return false
  }
  return axis === 'x' ? el.scrollWidth > el.clientWidth + 1 : el.scrollHeight > el.clientHeight + 1
}

function isEditable(el: HTMLElement) {
  const tag = el.tagName
  return tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT' || el.isContentEditable
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function pixelDelta(event: WheelEvent) {
  let { deltaX, deltaY } = event
  if (event.deltaMode === 1) {
    deltaX *= LINE
    deltaY *= LINE
  } else if (event.deltaMode === 2) {
    deltaX *= window.innerWidth
    deltaY *= window.innerHeight
  }
  return { x: deltaX * SPEED, y: deltaY * SPEED }
}

function wheelTarget(event: WheelEvent) {
  const useX = Math.abs(event.deltaX) > Math.abs(event.deltaY)
  let node: Node | null = event.target instanceof Node ? event.target : null
  while (node && node !== document.documentElement) {
    if (node instanceof HTMLElement) {
      if (isEditable(node) && (canScroll(node, 'x') || canScroll(node, 'y'))) {
        return null
      }
      const canX = canScroll(node, 'x')
      const canY = canScroll(node, 'y')
      if (useX && canX) {
        return { el: node, axis: 'x' as const }
      }
      if (!useX && canY) {
        return { el: node, axis: 'y' as const }
      }
      if (!useX && canX && !canY) {
        return { el: node, axis: 'x' as const }
      }
    }
    node = node.parentNode
  }
  return null
}

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function setScroll(el: HTMLElement, left: number, top: number) {
  el.scrollLeft = left
  el.scrollTop = top
}

function easeOutQuint(t: number) {
  return 1 - (1 - t) ** 5
}

export function bindSmoothWheel() {
  const anims = new Map<HTMLElement, Anim>()

  function tick(el: HTMLElement) {
    const anim = anims.get(el)
    if (!anim) {
      return
    }
    const progress = Math.min(1, (performance.now() - anim.startedAt) / DURATION)
    const eased = easeOutQuint(progress)
    setScroll(
      el,
      anim.fromX + (anim.toX - anim.fromX) * eased,
      anim.fromY + (anim.toY - anim.fromY) * eased,
    )
    if (progress >= 1) {
      anims.delete(el)
      return
    }
    anim.raf = requestAnimationFrame(() => tick(el))
  }

  function onWheel(event: WheelEvent) {
    if (event.defaultPrevented || event.ctrlKey) {
      return
    }
    const hit = wheelTarget(event)
    if (!hit) {
      return
    }
    const mouseLike = event.deltaMode !== 0 || Math.abs(event.deltaX) >= 50 || Math.abs(event.deltaY) >= 50
    if (hit.axis === 'y' && !mouseLike) {
      return
    }
    event.preventDefault()
    const { el, axis } = hit
    const maxX = Math.max(0, el.scrollWidth - el.clientWidth)
    const maxY = Math.max(0, el.scrollHeight - el.clientHeight)
    const delta = pixelDelta(event)
    const mapped = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? delta.x : delta.y
    if (reducedMotion()) {
      if (axis === 'x') {
        setScroll(el, clamp(el.scrollLeft + mapped, 0, maxX), el.scrollTop)
      } else {
        setScroll(el, clamp(el.scrollLeft + delta.x, 0, maxX), clamp(el.scrollTop + delta.y, 0, maxY))
      }
      return
    }
    const now = performance.now()
    let anim = anims.get(el)
    if (!anim) {
      anim = {
        fromX: el.scrollLeft,
        fromY: el.scrollTop,
        toX: el.scrollLeft,
        toY: el.scrollTop,
        startedAt: now,
        raf: 0,
      }
      anims.set(el, anim)
    }
    anim.fromX = el.scrollLeft
    anim.fromY = el.scrollTop
    anim.startedAt = now
    if (axis === 'x') {
      anim.toX = clamp(anim.toX + mapped, 0, maxX)
    } else {
      anim.toX = clamp(anim.toX + delta.x, 0, maxX)
      anim.toY = clamp(anim.toY + delta.y, 0, maxY)
    }
    if (!anim.raf) {
      anim.raf = requestAnimationFrame(() => tick(el))
    }
  }

  document.addEventListener('wheel', onWheel, { passive: false })
  return () => {
    document.removeEventListener('wheel', onWheel)
    for (const anim of anims.values()) {
      cancelAnimationFrame(anim.raf)
    }
    anims.clear()
  }
}
