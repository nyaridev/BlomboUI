import type { ReactNode } from 'react'

export function MetaCard({
  title,
  children,
  className = '',
  mono = false,
}: {
  title: string
  children: ReactNode
  className?: string
  mono?: boolean
}) {
  return (
    <div className={['rounded-md border border-line p-2', className].join(' ')}>
      <div className="mb-1 text-muted">{title}</div>
      <div className={['whitespace-pre-wrap break-words text-ink', mono ? 'font-mono' : ''].join(' ')}>
        {children}
      </div>
    </div>
  )
}
