import type { ReactNode } from 'react'

export function ParamSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-stack">
      <div className="flex items-center gap-2">
        <h2 className="shrink-0 text-xs text-label">{title}</h2>
        <div className="min-w-0 flex-1 border-t border-line" />
      </div>
      {children}
    </section>
  )
}
