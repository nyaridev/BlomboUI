import { SelectField } from '@/components/controls/select/SelectField.tsx'
import { TextField } from '@/components/controls/input/TextField.tsx'
import type { SelectOption } from '@/components/controls/select/selectNav.ts'

export function ManagerFilters({
  filter,
  type,
  base,
  query,
  types,
  bases,
  onFilter,
  onType,
  onBase,
  onQuery,
}: {
  filter: string
  type: string
  base: string
  query: string
  types: string[]
  bases: string[]
  onFilter: (value: string) => void
  onType: (value: string) => void
  onBase: (value: string) => void
  onQuery: (value: string) => void
}) {
  const typeOptions: SelectOption[] = [{ value: 'all', label: 'All' }, ...types.map((item) => ({ value: item, label: item }))]
  const baseOptions: SelectOption[] = [{ value: 'all', label: 'All' }, ...bases.map((item) => ({ value: item, label: item }))]
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-cluster">
      <label className="flex w-48 items-center gap-cluster text-xs text-muted">
        Filter
        <div className="min-w-0 flex-1">
          <SelectField
            value={filter}
            onChange={onFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'installed', label: 'Installed' },
              { value: 'not_installed', label: 'Not Installed' },
            ]}
          />
        </div>
      </label>
      <label className="flex w-48 items-center gap-cluster text-xs text-muted">
        Type
        <div className="min-w-0 flex-1">
          <SelectField value={type} onChange={onType} options={typeOptions} />
        </div>
      </label>
      <label className="flex w-48 items-center gap-cluster text-xs text-muted">
        Base
        <div className="min-w-0 flex-1">
          <SelectField value={base} onChange={onBase} options={baseOptions} />
        </div>
      </label>
      <div className="min-w-48 flex-1">
        <TextField type="search" value={query} placeholder="Search" onChange={(event) => onQuery(event.target.value)} />
      </div>
    </div>
  )
}
