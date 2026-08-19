import type { CivitaiLayoutData } from './CivitaiLayouts.tsx'
import { Base, Desc, Meta, Name, Pills } from './CivitaiLayouts.tsx'
import type { TrainingGroup } from './safetensors.ts'
import type { ReactNode } from 'react'

function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={['rounded-md border border-line bg-bg', className].filter(Boolean).join(' ')}>
      {children}
    </section>
  )
}

export function SafetensorsDashboard({
  data,
  groups,
  raw,
}: {
  data: CivitaiLayoutData | null
  groups: TrainingGroup[]
  raw: string
}) {
  const fields = groups.flatMap((group) => group.fields)
  return (
    <div className="flex flex-col gap-3">
      {data ? (
        <div className="flex gap-3">
          <Panel className="min-w-0 flex-1 p-4">
            <Name data={data} className="text-xl" />
            <Meta data={data} className="mt-1" />
            <Base data={data} />
            <Desc data={data} className="mt-2 text-xs" />
          </Panel>
          {data.triggers.length ? (
            <Panel className="w-[42%] shrink-0 p-4">
              <p className="mb-1.5 text-xs text-muted">Trigger words</p>
              <Pills data={data} />
            </Panel>
          ) : null}
        </div>
      ) : null}
      {fields.length ? (
        <Panel className="p-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {fields.map((field) => (
              <div key={field.label} className="min-w-0">
                <dt className="text-xs text-muted">{field.label}</dt>
                <dd className="text-sm break-all text-ink">{field.value}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      ) : !raw && !data ? (
        <p className="text-sm text-muted">No metadata found.</p>
      ) : null}
    </div>
  )
}
