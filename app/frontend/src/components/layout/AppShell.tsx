import type { ReactNode, RefObject } from 'react'

export function AppShell({
  topBar,
  footer,
  overlay,
  mainRef,
  overflowHidden,
  padded,
  children,
}: {
  topBar: ReactNode
  footer: ReactNode
  overlay?: ReactNode
  mainRef: RefObject<HTMLElement | null>
  overflowHidden: boolean
  padded: boolean
  children: ReactNode
}) {
  return (
    <div className="flex h-svh flex-col overflow-hidden">
      {topBar}
      <main
        ref={mainRef}
        className={['min-h-0 flex-1 [overflow-anchor:none]', overflowHidden ? 'overflow-hidden' : 'overflow-y-auto'].join(' ')}
      >
        <div className={['flex h-full min-h-0 flex-col', padded ? 'px-10 py-4' : ''].join(' ')}>{children}</div>
      </main>
      {footer}
      {overlay}
    </div>
  )
}
