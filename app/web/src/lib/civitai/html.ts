const ALLOWED = new Set([
  'P',
  'DIV',
  'SPAN',
  'STRONG',
  'B',
  'EM',
  'I',
  'U',
  'A',
  'IMG',
  'UL',
  'OL',
  'LI',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'BR',
  'BLOCKQUOTE',
  'HR',
  'CODE',
  'PRE',
])

const ALIGN = new Set(['left', 'right', 'center', 'justify'])
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\([^)]+\)|[a-z]+)$/i

function safeUrl(value: string) {
  const href = value.trim()
  if (!/^https?:\/\//i.test(href)) {
    return ''
  }
  if (/javascript:/i.test(href)) {
    return ''
  }
  return href
}

function safeStyle(value: string) {
  const kept: string[] = []
  for (const part of value.split(';')) {
    const [rawName, ...rest] = part.split(':')
    const name = rawName?.trim().toLowerCase()
    const val = rest.join(':').trim()
    if (!name || !val) {
      continue
    }
    if ((name === 'color' || name === 'background-color') && COLOR.test(val) && !/url\s*\(/i.test(val)) {
      kept.push(`${name}: ${val}`)
    }
    if (name === 'text-align' && ALIGN.has(val.toLowerCase())) {
      kept.push(`${name}: ${val.toLowerCase()}`)
    }
  }
  return kept.join('; ')
}

function copyText(node: Node, into: ParentNode) {
  if (node.nodeType === Node.TEXT_NODE) {
    into.appendChild(document.createTextNode(node.textContent || ''))
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return
  }
  const el = node as Element
  const tag = el.tagName.toUpperCase()
  if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IFRAME' || tag === 'OBJECT') {
    return
  }
  if (!ALLOWED.has(tag)) {
    for (const child of Array.from(el.childNodes)) {
      copyText(child, into)
    }
    return
  }
  const next = document.createElement(tag.toLowerCase())
  if (tag === 'A') {
    const href = safeUrl(el.getAttribute('href') || '')
    if (href) {
      next.setAttribute('href', href)
      next.setAttribute('target', '_blank')
      next.setAttribute('rel', 'noreferrer')
    }
  }
  if (tag === 'IMG') {
    const src = safeUrl(el.getAttribute('src') || '')
    if (!src) {
      return
    }
    next.setAttribute('src', src)
    const alt = el.getAttribute('alt')
    if (alt) {
      next.setAttribute('alt', alt)
    }
  }
  const style = safeStyle(el.getAttribute('style') || '')
  if (style) {
    next.setAttribute('style', style)
  }
  for (const child of Array.from(el.childNodes)) {
    copyText(child, next)
  }
  into.appendChild(next)
}

export function sanitizeCivitaiHtml(html: string) {
  const raw = html.trim()
  if (!raw) {
    return ''
  }
  const doc = new DOMParser().parseFromString(`<div>${raw}</div>`, 'text/html')
  const source = doc.body.firstElementChild
  if (!source) {
    return ''
  }
  const out = document.createElement('div')
  for (const child of Array.from(source.childNodes)) {
    copyText(child, out)
  }
  return out.innerHTML
}
