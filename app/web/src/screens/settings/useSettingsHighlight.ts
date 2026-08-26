import { useEffect, useLayoutEffect } from 'react'

export const SETTINGS_HASH_TARGETS = {
  '#placeholders': { page: 'Output', id: 'settings-placeholders' },
  '#civitai': { page: 'civitai-account', id: 'settings-civitai' },
  '#author-aliases': { page: 'author-aliases', id: 'settings-author-aliases' },
} as const

const GLOW_MS = 1000

function glow(id: string) {
  const el = document.getElementById(id)
  if (!el) {
    return
  }
  el.scrollIntoView({ block: 'center' })
  el.classList.remove('settings-glow')
  void el.offsetWidth
  el.classList.add('settings-glow')
}

export function useSettingsHighlight({
  pathname,
  hash,
  page,
  searching,
  setPage,
  setQuery,
}: {
  pathname: string
  hash: string
  page: string
  searching: boolean
  setPage: (id: string) => void
  setQuery: (query: string) => void
}) {
  const target =
    pathname === '/settings' ? SETTINGS_HASH_TARGETS[hash as keyof typeof SETTINGS_HASH_TARGETS] : undefined

  useEffect(() => {
    if (!target) {
      return
    }
    setQuery('')
    setPage(target.page)
  }, [target, setPage, setQuery])

  useLayoutEffect(() => {
    if (!target || page !== target.page || searching) {
      return
    }
    let inner = 0
    const frame = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => glow(target.id))
    })
    const hide = window.setTimeout(() => {
      document.getElementById(target.id)?.classList.remove('settings-glow')
    }, GLOW_MS)
    return () => {
      window.cancelAnimationFrame(frame)
      window.cancelAnimationFrame(inner)
      window.clearTimeout(hide)
    }
  }, [target, page, searching])
}
