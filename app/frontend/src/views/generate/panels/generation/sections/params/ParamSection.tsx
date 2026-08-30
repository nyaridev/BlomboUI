import type { ReactNode } from 'react'

export function ParamSection({
  title,
  children,
  spaced = false,
}: {
  title: string
  children: ReactNode
  spaced?: boolean
}) {
  return (
    <section className={['mt-8 flex flex-col gap-2', spaced ? '' : 'first:mt-0'].filter(Boolean).join(' ')}>
      <div className="flex items-center gap-2">
        <h2 className="shrink-0 text-xs text-label">{title}</h2>
        <div className="min-w-0 flex-1 border-t border-line" />
      </div>
      {children}
    </section>
  )
}
