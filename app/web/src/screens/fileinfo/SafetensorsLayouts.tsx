import type { CivitaiLayoutData } from './CivitaiLayouts.tsx'
import { Base, Desc, Meta, Name, Pills } from './CivitaiLayouts.tsx'
import type { TagCount, TrainingField, TrainingGroup } from './safetensors.ts'
import type { ReactNode } from 'react'

function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={['rounded-md border border-line bg-bg', className].filter(Boolean).join(' ')}>
      {children}
    </section>
  )
}

function FieldValue({ field }: { field: TrainingField }) {
  if (field.current && field.max) {
    return (
      <span className="tabular-nums">
        {field.current} <span className="text-muted">of</span> {field.max}
      </span>
    )
  }
  return field.value || ''
}

export function SafetensorsDashboard({
  data,
  groups,
  tags,
  raw,
}: {
  data: CivitaiLayoutData | null
  groups: TrainingGroup[]
  tags: TagCount[]
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
      {fields.length || tags.length ? (
        <div className="flex gap-3">
          {fields.length ? (
            <Panel className="min-w-0 flex-1 p-4">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                {fields.map((field) => (
                  <div key={field.label} className="min-w-0">
                    <dt className="text-xs text-muted">{field.label}</dt>
                    <dd className="text-sm break-all text-ink">
                      <FieldValue field={field} />
                    </dd>
                  </div>
                ))}
              </dl>
            </Panel>
          ) : null}
          {tags.length ? (
            <Panel className="w-72 shrink-0 p-4">
              <p className="mb-1.5 text-xs text-muted">Frequent tags</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="pb-1 pr-2 font-medium">Tag</th>
                    <th className="pb-1 text-right font-medium">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {tags.map((row) => (
                    <tr key={row.tag} className="border-t border-line">
                      <td className="py-1 pr-2 break-all text-ink">{row.tag}</td>
                      <td className="py-1 text-right tabular-nums text-ink">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          ) : null}
        </div>
      ) : !raw && !data ? (
        <p className="text-sm text-muted">No metadata found.</p>
      ) : null}
    </div>
  )
}
